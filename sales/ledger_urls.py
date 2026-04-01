from django.urls import path
from .ledger_views import LedgerEntryListView, LedgerSummaryView


urlpatterns = [
    path("", LedgerEntryListView.as_view(), name="ledger-list"),
    path("summary/", LedgerSummaryView.as_view(), name="ledger-summary"),
]
