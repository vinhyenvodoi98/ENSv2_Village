"use client";

import type { Cart as CartData } from "@/world/core/types";

interface CartProps {
  cart: CartData;
}

/** A single cart mesh moving along a road. Stub for task 20 — built in task 26. */
export function Cart({ cart }: CartProps) {
  void cart;
  return null;
}
