from django.db import models
import uuid
from django.contrib.auth.models import AbstractUser, PermissionsMixin
from core.models import BaseModel
from .managers import UserManager

class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    correlation_id = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        'self', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='created_users_set'
    )
    updated_by = models.ForeignKey(
        'self', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='updated_users_set'
    )
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    branch = models.ForeignKey("business.Branch", on_delete=models.SET_NULL, null=True, related_name="users")
    first_name = models.CharField(max_length=255)
    middle_name = models.CharField(max_length=255, blank=True, null=True)
    last_name = models.CharField(max_length=255)
    id_number = models.CharField(max_length=10, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)  
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    
    ROLE_CHOICES = (
        ("cashier", "Cashier"),
        ("supervisor", "Supervisor"),
        ("deliver_person", "Delivery_person")
    )
    role = models.CharField(max_length=50,choices=ROLE_CHOICES)
    
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)
    objects = UserManager()
    
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    def __str__(self):
        return f"{self.email} - {self.role}"

class DriverLicense(BaseModel):
    user = models.OneToOneField(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name="driver_license",
    )

    license_number = models.CharField(max_length=100, unique=True)
    issued_date = models.DateField()
    expiry_date = models.DateField()

    def __str__(self):
        return f"{self.user.email} - {self.license_number}"