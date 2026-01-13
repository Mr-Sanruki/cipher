import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { Colors } from "../../utils/colors";
import { isValidEmail } from "../../utils/validators";
import { useAuth } from "../../hooks/useAuth";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PremiumButton } from "../../components/PremiumButton";
import { PremiumScreen } from "../../components/PremiumScreen";

export default function LoginScreen(): JSX.Element {
  const { login, requestOtp, isBusy, error, clearError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const combinedError = useMemo(() => localError ?? error, [localError, error]);

  async function onSubmit(): Promise<void> {
    clearError();
    setLocalError(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      setLocalError("Please enter a valid email");
      return;
    }

    if (password.trim().length < 8) {
      setLocalError("Password must be at least 8 characters");
      return;
    }

    try {
      await login({ email: normalizedEmail, password });
      router.replace("/(app)/chat");
    } catch (e: any) {
      const status = Number(e?.status ?? 0);
      const message = typeof e?.message === "string" ? e.message : "";

      if (status === 403 && message.toLowerCase().includes("not verified")) {
        try {
          const result = await requestOtp({ email: normalizedEmail });
          router.replace({
            pathname: "/(auth)/verify-otp",
            params: {
              email: normalizedEmail,
              ...(result.devOtp ? { devOtp: result.devOtp } : {}),
              expiresIn: String(result.expiresIn),
            },
          });
        } catch {
          return;
        }
      }
    }
  }

  return (
    <PremiumScreen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 24 }}
        >
          <View style={{ flex: 1, justifyContent: "center" }}>
            <View style={{ alignItems: "center", marginBottom: 18 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  backgroundColor: "rgba(59,130,246,0.18)",
                  borderWidth: 1,
                  borderColor: "rgba(59,130,246,0.30)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: Colors.primaryBlue, fontWeight: "900", fontSize: 20 }}>C</Text>
              </View>
              <Text style={{ color: Colors.dark.textPrimary, fontSize: 26, fontWeight: "900" }}>Welcome back</Text>
              <Text style={{ color: Colors.dark.textSecondary, marginTop: 6, textAlign: "center" }}>
                Login to continue to Cipher
              </Text>
            </View>

            <View
              style={{
                borderRadius: 20,
                padding: 16,
                backgroundColor: "rgba(255,255,255,0.04)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginBottom: 8 }}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                onFocus={() => {
                  clearError();
                  setLocalError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="you@example.com"
                placeholderTextColor={Colors.dark.textSecondary}
                className="h-12 rounded-xl border px-4"
                style={{ borderColor: Colors.dark.border, backgroundColor: Colors.dark.surface2, color: Colors.dark.textPrimary }}
              />

              <View style={{ marginTop: 14 }}>
                <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginBottom: 8 }}>Password</Text>
                <View
                  className="flex-row items-center rounded-xl border px-4"
                  style={{ borderColor: Colors.dark.border, backgroundColor: Colors.dark.surface2 }}
                >
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => {
                      clearError();
                      setLocalError(null);
                    }}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    textContentType="password"
                    placeholder="••••••••"
                    className="h-12 flex-1"
                    placeholderTextColor={Colors.dark.textSecondary}
                    style={{ color: Colors.dark.textPrimary }}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  >
                    <Text style={{ color: Colors.primaryBlue, fontWeight: "700" }}>{showPassword ? "Hide" : "Show"}</Text>
                  </Pressable>
                </View>
              </View>

              <View className="mt-3 flex-row justify-end">
                <Pressable
                  onPress={() => {
                    const normalizedEmail = email.trim().toLowerCase();

                    if (!isValidEmail(normalizedEmail)) {
                      clearError();
                      setLocalError("Please enter a valid email");
                      return;
                    }

                    clearError();
                    setLocalError(null);

                    void (async () => {
                      try {
                        const result = await requestOtp({ email: normalizedEmail });
                        router.push({
                          pathname: "/(auth)/verify-otp",
                          params: {
                            email: normalizedEmail,
                            ...(result.devOtp ? { devOtp: result.devOtp } : {}),
                            expiresIn: String(result.expiresIn),
                          },
                        });
                      } catch {
                        return;
                      }
                    })();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Verify email"
                >
                  <Text className="text-sm" style={{ color: Colors.secondaryCyan, fontWeight: "700" }}>
                    Verify email / resend OTP
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

              <View style={{ marginTop: 16 }}>
                <PremiumButton
                  title={isBusy ? "Logging in..." : "Login"}
                  onPress={() => {
                    if (!isBusy) {
                      void onSubmit();
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
            </View>

            <View className="mt-6 flex-row justify-center">
              <Text style={{ color: Colors.dark.textSecondary }}>Don’t have an account? </Text>
              <Link href="/(auth)/signup" asChild>
                <Text style={{ color: Colors.primaryBlue, fontWeight: "800" }}>Sign up</Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </PremiumScreen>
  );
}
