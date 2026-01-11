import { useContext } from "react";
import { CallContext } from "../context/CallContext";

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCall must be used within CallProvider");
  }
  return ctx;
}
