import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Colors } from "../../utils/colors";
import { useAuth } from "../../hooks/useAuth";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PremiumButton } from "../../components/PremiumButton";
import { PremiumScreen } from "../../components/PremiumScreen";

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(name.length - visible.length, 1))}@${domain}`;
}

export default function VerifyOtpScreen(): JSX.Element {
  const params = useLocalSearchParams<{ email?: string; devOtp?: string; expiresIn?: string }>();
  const email = (params.email ?? "").toString().trim().toLowerCase();
  const devOtp = (params.devOtp ?? "").toString().trim();
  const expiresInParam = (params.expiresIn ?? "").toString().trim();

  const { verifyOtp, requestOtp, isBusy, error, clearError } = useAuth();

  const [digits, setDigits] = useState<string[]>(() => {
    if (/^\d{6}$/.test(devOtp)) return devOtp.split("");
    return ["", "", "", "", "", ""];
  });
  const inputsRef = useRef<(TextInput | null)[]>([]);

  const [resendCooldown, setResendCooldown] = useState(30);
  const [expirySeconds, setExpirySeconds] = useState(() => {
    const parsed = Number(expiresInParam);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 600;
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const combinedError = useMemo(() => localError ?? error, [localError, error]);

  useEffect(() => {
    if (!email) {
      router.replace("/(auth)/signup");
    }
  }, [email]);

  useEffect(() => {
    if (!/^\d{6}$/.test(devOtp)) return;

    setDigits((prev) => {
      const current = prev.join("");
      if (current === devOtp) return prev;
      if (/^\d{6}$/.test(current)) return prev;
      return devOtp.split("");
    });

    const parsedExpires = Number(expiresInParam);
    if (Number.isFinite(parsedExpires) && parsedExpires > 0) {
      setExpirySeconds(parsedExpires);
    }
  }, [devOtp, expiresInParam]);

  useEffect(() => {
    const t = setInterval(() => {
      setResendCooldown((s) => (s > 0 ? s - 1 : 0));
      setExpirySeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearInterval(t);
  }, []);

  const otp = useMemo(() => digits.join(""), [digits]);

  function focusIndex(index: number) {
    const el = inputsRef.current[index];
    el?.focus();
  }

  function onChangeAt(index: number, value: string) {
    clearError();
    setLocalError(null);

    const numeric = value.replace(/\D/g, "");

    if (numeric.length === 0) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }

    if (numeric.length === 1) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = numeric;
        return next;
      });

      if (index < 5) focusIndex(index + 1);
      return;
    }

    // Handle paste of full code

    const slice = numeric.slice(0, 6 - index).split("");

    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < slice.length && index + i < 6; i += 1) {
        next[index + i] = slice[i] ?? "";
      }
      return next;
    });

    const nextFocus = Math.min(index + slice.length, 5);
    focusIndex(nextFocus);
  }

  function onKeyPressAt(index: number, key: string) {
    if (key !== "Backspace") return;

    if (digits[index]) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }

    if (index > 0) {
      focusIndex(index - 1);
      setDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
    }
  }

  async function onVerify(): Promise<void> {
    clearError();
    setLocalError(null);

    if (!/^\d{6}$/.test(otp)) {
      setLocalError("Enter the 6-digit code");
      return;
    }

    if (expirySeconds <= 0) {
      setLocalError("OTP expired. Please resend.");
      return;
    }

    await verifyOtp({ email, otp });
    router.replace("/(app)/chat");
  }

  async function onResend(): Promise<void> {
    if (resendCooldown > 0) return;

    clearError();
    setLocalError(null);

    const result = await requestOtp({ email });
    setResendCooldown(30);
    setExpirySeconds(result.expiresIn);

    if (result.devOtp && /^\d{6}$/.test(result.devOtp)) {
      setDigits(result.devOtp.split(""));
      focusIndex(5);
    }
  }

  const expiryLabel = useMemo(() => {
    const minutes = Math.floor(expirySeconds / 60);
    const seconds = expirySeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [expirySeconds]);

  return (
    <PremiumScreen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <Text className="text-3xl font-bold" style={{ color: Colors.primaryBlue }}>
          Verify OTP
        </Text>
        <Text className="mt-2 text-base" style={{ color: Colors.dark.textSecondary }}>
          We sent a 6-digit code to {maskEmail(email)}
        </Text>

        <View className="mt-10 flex-row justify-between">
          {digits.map((d, idx) => (
            <TextInput
              key={idx}
              ref={(r) => {
                inputsRef.current[idx] = r;
              }}
              value={d}
              onChangeText={(v) => onChangeAt(idx, v)}
              onKeyPress={({ nativeEvent }) => onKeyPressAt(idx, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={6}
              className="h-12 w-12 rounded-xl border text-center text-lg"
              style={{ borderColor: Colors.dark.border, backgroundColor: Colors.dark.surface2, color: Colors.dark.textPrimary }}
              placeholderTextColor={Colors.dark.textSecondary}
              accessibilityLabel={`OTP digit ${idx + 1}`}
            />
          ))}
        </View>

        <View className="mt-4 flex-row justify-between">
          <Text style={{ color: Colors.dark.textSecondary }}>Expires in {expiryLabel}</Text>
          <Pressable
            onPress={() => {
              onResend().catch(() => {
                // handled
              });
            }}
            accessibilityRole="button"
            accessibilityLabel="Resend OTP"
          >
            <Text style={{ color: resendCooldown > 0 ? Colors.dark.textSecondary : Colors.secondaryCyan }}>
              Resend OTP{resendCooldown > 0 ? ` (${resendCooldown})` : ""}
            </Text>
          </Pressable>
        </View>

        {combinedError ? (
          <View
            className="mt-4 rounded-xl border px-4 py-3"
            style={{ borderColor: "rgba(220,38,38,0.35)", backgroundColor: "rgba(220,38,38,0.12)" }}
          >
            <Text style={{ color: "#FCA5A5" }}>{combinedError}</Text>
          </View>
        ) : null}

        <View className="mt-6">
          <PremiumButton
            title={isBusy ? "Verifying..." : "Verify"}
            onPress={() => {
              if (!isBusy) {
                onVerify().catch(() => {
                  // handled
                });
              }
            }}
            disabled={isBusy}
          />
        </View>

        {isBusy ? (
          <View className="mt-3">
            <LoadingSpinner />
          </View>
        ) : null}

        <View className="mt-6 flex-row justify-center">
          <Link href="/(auth)/signup" asChild>
            <Text style={{ color: Colors.secondaryCyan, fontWeight: "600" }}>Change email?</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </PremiumScreen>
  );
}
