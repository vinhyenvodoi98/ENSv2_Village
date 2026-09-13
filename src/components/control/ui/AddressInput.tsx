"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import { ActionButton } from "./ActionButton";

/// The `0x…` + validate + submit trio that `LifecyclePanel`'s `RepointField` and
/// `SubnameManagerPanel`'s `InlineAddressAction` each wrote separately. Clears its own input once
/// `onSubmit` is called — the caller decides whether the submit actually goes through.
export function AddressInput({
  placeholder = "0x… new address",
  disabled,
  enabled = true,
  onSubmit,
  submitLabel = "Set",
  pending,
  reason,
}: {
  placeholder?: string;
  disabled?: boolean;
  enabled?: boolean;
  onSubmit: (address: Address) => void;
  submitLabel?: string;
  pending?: boolean;
  reason?: string;
}) {
  const [value, setValue] = useState("");
  const valid = isAddress(value);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="min-w-0 flex-1 rounded-sm border border-[#9c7b49] bg-[#f6efdc] px-2.5 py-1.5 font-mono text-xs text-[#3a2918] placeholder:text-[#a8926e] disabled:opacity-40"
      />
      <ActionButton
        label={submitLabel}
        enabled={enabled && !disabled && valid}
        onClick={() => {
          if (!valid) return;
          onSubmit(value as Address);
          setValue("");
        }}
        pending={pending}
        reason={reason}
        size="sm"
      />
    </div>
  );
}
