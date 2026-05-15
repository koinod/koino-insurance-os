"""Connector stubs — each module imports `make_stub` and returns a tool
that 501s with a clear message. Lets the agent's tool registry advertise
support for every connector in the PRD even before wiring is done.

Real implementations replace these by being saved as their own .py file
under tools/ with the same name.
"""
from __future__ import annotations


def make_stub(provider: str, action: str, required_caps: list[str], rate_bucket: str | None = None):
    def run(payload, ctx):
        return {
            "status": "not_implemented",
            "provider": provider,
            "action": action,
            "message": f"{provider}.{action} is registered but not yet wired. "
                       f"Connect via Settings → Connectors → {provider} OAuth.",
        }
    run.REQUIRED_CAPS = required_caps
    run.RATE_BUCKET = rate_bucket
    return run
