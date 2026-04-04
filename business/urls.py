from django.urls import path
from .views import BranchListView, BranchCreateView, BranchUpdateView

urlpatterns = [
    path("branches/", BranchListView.as_view(), name="list_branches"),
    path("branches/create/", BranchCreateView.as_view(), name="create_branch"),
    path("branches/<uuid:branch_id>/", BranchUpdateView.as_view(), name="update_branch"),
]
