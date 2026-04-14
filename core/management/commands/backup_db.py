import os
import shlex
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

import dj_database_url
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import SystemBackup


def _get_db_config():
    url = os.environ.get("DATABASE_URL") or ""
    if url:
        return dj_database_url.parse(url)
    return settings.DATABASES.get("default", {})


def _resolve_backup_dir():
    base = os.environ.get("BACKUP_DIR")
    if base:
        return Path(base).expanduser()
    return Path(settings.BASE_DIR) / "backups"


class Command(BaseCommand):
    help = "Create a PostgreSQL database backup using pg_dump."
    REMOTE_ERROR_MAX_LEN = 1000

    def add_arguments(self, parser):
        parser.add_argument(
            "--type",
            choices=["manual", "scheduled"],
            default="manual",
            help="Backup type for tracking (manual or scheduled).",
        )

    def handle(self, *args, **options):
        backup_type = options.get("type") or "manual"
        db = _get_db_config()
        engine = db.get("ENGINE") or ""
        if "postgresql" not in engine:
            raise CommandError("backup_db supports PostgreSQL only.")

        name = db.get("NAME") or ""
        user = db.get("USER") or ""
        password = db.get("PASSWORD") or ""
        host = db.get("HOST") or ""
        port = db.get("PORT") or ""

        if not name:
            raise CommandError("Database NAME is missing.")

        backup_dir = _resolve_backup_dir()
        backup_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        file_name = f"backup_{name}_{timestamp}.dump"
        file_path = backup_dir / file_name

        env = os.environ.copy()
        if password:
            env["PGPASSWORD"] = password

        pg_dump_executable = os.environ.get("PG_DUMP_PATH") or shutil.which("pg_dump")
        if not pg_dump_executable:
            raise CommandError(
                "pg_dump not found. Please install PostgreSQL client tools or set PG_DUMP_PATH."
            )

        cmd = [
            pg_dump_executable,
            "--format=custom",
            "--no-owner",
            "--no-privileges",
        ]
        if host:
            cmd.extend(["--host", str(host)])
        if port:
            cmd.extend(["--port", str(port)])
        if user:
            cmd.extend(["--username", str(user)])
        cmd.extend(["--file", str(file_path), name])

        backup_record = SystemBackup(
            backup_type=backup_type,
            file_name=file_name,
            storage_path=str(file_path),
            status="failed",
            size_bytes=0,
        )

        try:
            self.stdout.write(f"Using pg_dump at: {pg_dump_executable}")
            self.stdout.write(f"Running: {' '.join(shlex.quote(c) for c in cmd)}")
            result = subprocess.run(cmd, env=env, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                stderr = result.stderr.strip()
                message = stderr or "pg_dump failed."
                raise CommandError(f"pg_dump failed using executable {pg_dump_executable}: {message}")

            size_bytes = file_path.stat().st_size if file_path.exists() else 0
            backup_record.status = "success"
            backup_record.size_bytes = size_bytes
            backup_record.error_message = ""
            backup_record.save()
            try:
                self._upload_to_s3_if_configured(backup_record, file_path)
            finally:
                self._apply_retention(backup_dir, name, preserve_path=file_path)
            self.stdout.write(
                self.style.SUCCESS(f"Backup created: {file_path} ({size_bytes} bytes)")
            )
        except CommandError as exc:
            if backup_record.status != "success":
                backup_record.error_message = str(exc)
                backup_record.save()
            self.stderr.write(self.style.ERROR(f"Backup failed: {exc}"))
            raise
        except FileNotFoundError:
            backup_record.error_message = "pg_dump not found. Ensure PostgreSQL client tools are installed."
            backup_record.save()
            raise CommandError(backup_record.error_message)

    def _upload_to_s3_if_configured(self, backup_record: SystemBackup, file_path: Path) -> None:
        enabled = self._is_s3_enabled()
        if not enabled:
            self.stdout.write("S3 upload skipped (BACKUP_S3_ENABLED is false).")
            self._set_remote_metadata(
                backup_record,
                status="skipped",
                storage_type="",
                key="",
                error_message="",
            )
            return

        try:
            config = self._get_s3_config()
        except CommandError as exc:
            self._fail_remote_upload(backup_record, str(exc))
            raise

        try:
            import boto3
        except ImportError as exc:
            message = "boto3 is required for S3 uploads. Add boto3 to requirements."
            self._fail_remote_upload(backup_record, message)
            raise CommandError(message) from exc

        key = self._build_s3_key(config["prefix"], file_path)
        session = boto3.session.Session(
            aws_access_key_id=config["access_key"],
            aws_secret_access_key=config["secret_key"],
            region_name=config["region"],
        )
        client = session.client("s3", endpoint_url=config["endpoint_url"])
        extra_args = {}
        if config["storage_class"]:
            extra_args["StorageClass"] = config["storage_class"]

        self.stdout.write(f"Uploading backup to s3://{config['bucket']}/{key}")
        try:
            if extra_args:
                client.upload_file(str(file_path), config["bucket"], key, ExtraArgs=extra_args)
            else:
                client.upload_file(str(file_path), config["bucket"], key)
        except Exception as exc:
            self._fail_remote_upload(backup_record, self._format_remote_error("S3 upload failed", exc), key)
            raise CommandError(self._format_remote_error("S3 upload failed", exc))

        self.stdout.write(f"Upload succeeded: s3://{config['bucket']}/{key}")
        try:
            self._set_remote_metadata(
                backup_record,
                status="success",
                storage_type="s3",
                key=key,
                error_message="",
            )
        except Exception as exc:
            self.stderr.write(
                f"Failed to record S3 metadata; attempting to delete remote object s3://{config['bucket']}/{key}"
            )
            self._attempt_s3_delete(client, config["bucket"], key)
            raise CommandError(self._format_remote_error("S3 upload succeeded but metadata save failed", exc))

    def _apply_retention(self, backup_dir: Path, db_name: str, preserve_path: Optional[Path] = None) -> None:
        raw_count = os.environ.get("BACKUP_RETENTION_COUNT", "7")
        try:
            retention_count = max(int(raw_count), 1)
        except (TypeError, ValueError):
            retention_count = 7

        pattern = f"backup_{db_name}_*.dump"
        candidates = list(backup_dir.glob(pattern))
        preserve_resolved = None
        if preserve_path and preserve_path.exists():
            preserve_candidate = preserve_path.resolve()
            if any(path.resolve() == preserve_candidate for path in candidates):
                preserve_resolved = preserve_candidate
                candidates = [path for path in candidates if path.resolve() != preserve_resolved]

        retention_limit = retention_count - 1 if preserve_resolved else retention_count
        if retention_limit < 0:
            retention_limit = 0
        if len(candidates) <= retention_limit:
            return

        candidates.sort(key=lambda path: path.stat().st_mtime, reverse=True)
        to_delete = candidates[retention_limit:]
        for path in to_delete:
            try:
                path.unlink()
                self.stdout.write(f"Deleted old backup: {path}")
            except OSError as exc:
                self.stderr.write(f"Failed to delete old backup {path}: {exc}")

    def _is_s3_enabled(self) -> bool:
        return os.environ.get("BACKUP_S3_ENABLED", "").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )

    def _get_s3_config(self) -> dict:
        bucket = os.environ.get("BACKUP_S3_BUCKET", "").strip()
        region = os.environ.get("BACKUP_S3_REGION", "").strip() or None
        prefix = os.environ.get("BACKUP_S3_PREFIX", "").strip()
        access_key = os.environ.get("BACKUP_S3_ACCESS_KEY_ID", "").strip()
        secret_key = os.environ.get("BACKUP_S3_SECRET_ACCESS_KEY", "").strip()
        endpoint_url = os.environ.get("BACKUP_S3_ENDPOINT_URL", "").strip() or None
        storage_class = os.environ.get("BACKUP_S3_STORAGE_CLASS", "").strip() or None

        missing = []
        if not bucket:
            missing.append("BACKUP_S3_BUCKET")
        if not access_key:
            missing.append("BACKUP_S3_ACCESS_KEY_ID")
        if not secret_key:
            missing.append("BACKUP_S3_SECRET_ACCESS_KEY")
        if missing:
            raise CommandError("Missing S3 config: " + ", ".join(missing))

        return {
            "bucket": bucket,
            "region": region,
            "prefix": prefix,
            "access_key": access_key,
            "secret_key": secret_key,
            "endpoint_url": endpoint_url,
            "storage_class": storage_class,
        }

    def _build_s3_key(self, prefix: str, file_path: Path) -> str:
        date_prefix = datetime.utcnow().strftime("%Y/%m/%d")
        normalized_prefix = prefix.strip("/")
        if normalized_prefix:
            return f"{normalized_prefix}/{date_prefix}/{file_path.name}"
        return f"{date_prefix}/{file_path.name}"

    def _truncate_error(self, message: str) -> str:
        if not message:
            return ""
        cleaned = str(message)
        if len(cleaned) <= self.REMOTE_ERROR_MAX_LEN:
            return cleaned
        return cleaned[: self.REMOTE_ERROR_MAX_LEN - 3] + "..."

    def _set_remote_metadata(
        self,
        backup_record: SystemBackup,
        status: str,
        storage_type: str,
        key: str,
        error_message: str,
    ) -> None:
        backup_record.remote_upload_status = status
        backup_record.remote_storage_type = storage_type
        backup_record.remote_storage_key = key
        backup_record.remote_error_message = self._truncate_error(error_message)
        backup_record.save()

    def _fail_remote_upload(
        self,
        backup_record: SystemBackup,
        message: str,
        key: str = "",
    ) -> None:
        safe_message = self._truncate_error(message)
        self.stderr.write(f"S3 upload failed: {safe_message}")
        self._set_remote_metadata(
            backup_record,
            status="failed",
            storage_type="s3",
            key=key,
            error_message=safe_message,
        )

    def _format_remote_error(self, prefix: str, exc: Exception) -> str:
        return f"{prefix}: {exc.__class__.__name__}: {exc}"

    def _attempt_s3_delete(self, client, bucket: str, key: str) -> None:
        try:
            client.delete_object(Bucket=bucket, Key=key)
            self.stderr.write(f"Deleted remote backup due to metadata failure: s3://{bucket}/{key}")
        except Exception as exc:
            self.stderr.write(
                f"Failed to delete remote backup after metadata failure: {exc.__class__.__name__}: {exc}"
            )
