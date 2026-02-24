from django.db import models
import uuid
from django.contrib.auth.models import AbstractUser, PermissionsMixin
from core.models import BaseModel
from .managers import UserManager

class User(AbstractUser, PermissionsMixin, BaseModel):
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
        return f"{self.user.email} - {self.role}"

class DriverLicense(BaseModel):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="driver_license",
    )

    license_number = models.CharField(max_length=100, unique=True)
    issued_date = models.DateField()
    expiry_date = models.DateField()

    def __str__(self):
        return f"{self.user.email} - {self.license_number}"