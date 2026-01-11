import React from "react";
import { Text, View } from "react-native";
import { Colors } from "../utils/colors";
import { PremiumButton } from "./PremiumButton";
import { PremiumModal } from "./PremiumModal";

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive,
  busy,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <PremiumModal
      visible={visible}
      title={title}
      canClose
      onClose={() => {
        onCancel();
      }}
    >
      {message ? <Text style={{ color: Colors.dark.textSecondary, lineHeight: 20 }}>{message}</Text> : null}

      <View className="mt-5 flex-row" style={{ gap: 10 }}>
        <View style={{ flex: 1 }}>
          <PremiumButton
            title={cancelText}
            variant="secondary"
            onPress={() => {
              if (!busy) onCancel();
            }}
            disabled={busy}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PremiumButton
            title={busy ? "Please wait..." : confirmText}
            variant={destructive ? "danger" : "primary"}
            onPress={() => {
              if (!busy) onConfirm();
            }}
            disabled={busy}
          />
        </View>
      </View>
    </PremiumModal>
  );
}
