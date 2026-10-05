"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { removeMember, setStaffActive } from "./actions";

export function RemoveMemberButton({ membershipId, label }: { membershipId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <span className="flex flex-col items-end gap-1">
      {confirming ? (
        <span className="flex gap-1">
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await removeMember(membershipId);
                if (res.error) setError(res.error);
              })
            }
          >
            {pending ? "Removing…" : `Remove ${label}`}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </span>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          Remove
        </Button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

export function StaffActiveButton({ staffId, active }: { staffId: string; active: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <Button
        variant={active ? "danger" : "secondary"}
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setStaffActive(staffId, !active);
            if (res.error) setError(res.error);
          })
        }
      >
        {pending ? "Saving…" : active ? "Deactivate" : "Reactivate"}
      </Button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </span>
  );
}
