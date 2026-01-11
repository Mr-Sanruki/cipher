import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { Colors } from "../../utils/colors";
import { isValidEmail, passwordStrength } from "../../utils/validators";
import { useAuth } from "../../hooks/useAuth";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PremiumButton } from "../../components/PremiumButton";
import { PremiumScreen } from "../../components/PremiumScreen";

export default function SignupScreen(): JSX.Element {
  const { signup, isBusy, error, clearError } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const combinedError = useMemo(() => localError ?? error, [localError, error]);
  const strength = useMemo(() => passwordStrength(password), [password]);

  async function onSubmit(): Promise<void> {
    clearError();
    setLocalError(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (name.trim().length < 2) {
      setLocalError("Please enter your name");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setLocalError("Please enter a valid email");
      return;
    }

    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }

    if (!acceptedTerms) {
      setLocalError("You must accept terms & conditions");
      return;
    }

    const result = await signup({ email: normalizedEmail, password, name: name.trim() });

    router.replace({
      pathname: "/(auth)/verify-otp",
      params: {
        email: result.email,
        ...(result.devOtp ? { devOtp: result.devOtp } : {}),
        ...(typeof result.expiresIn === "number" ? { expiresIn: String(result.expiresIn) } : {}),
      },
    });
  }

  return (
    <PremiumScreen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <Text className="text-3xl font-bold" style={{ color: Colors.primaryBlue }}>
          Create account
        </Text>
        <Text className="mt-2 text-base" style={{ color: Colors.dark.textSecondary }}>
          Join Cipher with your email
        </Text>

        <View className="mt-10">
          <Text className="mb-2 text-sm" style={{ color: Colors.dark.textSecondary }}>
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onFocus={() => {
              clearError();
              setLocalError(null);
            }}
            placeholder="Your name"
            placeholderTextColor={Colors.dark.textSecondary}
            className="h-12 rounded-xl border px-4"
            style={{ borderColor: Colors.dark.border, backgroundColor: Colors.dark.surface2, color: Colors.dark.textPrimary }}
          />

          <View className="mt-5">
            <Text className="mb-2 text-sm" style={{ color: Colors.dark.textSecondary }}>
              Email
            </Text>
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
              placeholder="you@example.com"
              placeholderTextColor={Colors.dark.textSecondary}
              className="h-12 rounded-xl border px-4"
              style={{ borderColor: Colors.dark.border, backgroundColor: Colors.dark.surface2, color: Colors.dark.textPrimary }}
            />
          </View>

          <View className="mt-5">
            <Text className="mb-2 text-sm" style={{ color: Colors.dark.textSecondary }}>
              Password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              onFocus={() => {
                clearError();
                setLocalError(null);
              }}
              secureTextEntry
              placeholder="Create a strong password"
              placeholderTextColor={Colors.dark.textSecondary}
              className="h-12 rounded-xl border px-4"
              style={{ borderColor: Colors.dark.border, backgroundColor: Colors.dark.surface2, color: Colors.dark.textPrimary }}
            />
            <Text className="mt-2 text-xs" style={{ color: Colors.dark.textSecondary }}>
              Strength: {strength.label}
            </Text>
          </View>

          <View className="mt-5">
            <Text className="mb-2 text-sm" style={{ color: Colors.dark.textSecondary }}>
              Confirm Password
            </Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onFocus={() => {
                clearError();
                setLocalError(null);
              }}
              secureTextEntry
              placeholder="Repeat password"
              placeholderTextColor={Colors.dark.textSecondary}
              className="h-12 rounded-xl border px-4"
              style={{ borderColor: Colors.dark.border, backgroundColor: Colors.dark.surface2, color: Colors.dark.textPrimary }}
            />
          </View>

          <Pressable
            onPress={() => setAcceptedTerms((v) => !v)}
            className="mt-5 flex-row items-center"
            accessibilityRole="checkbox"
            accessibilityLabel="Accept terms and conditions"
            accessibilityState={{ checked: acceptedTerms }}
          >
            <View
              className="h-5 w-5 items-center justify-center rounded border"
              style={{ borderColor: acceptedTerms ? Colors.primaryBlue : "#CBD5E1", backgroundColor: acceptedTerms ? Colors.primaryBlue : "transparent" }}
            >
              {acceptedTerms ? <Text className="text-white">✓</Text> : null}
            </View>
            <Text className="ml-3" style={{ color: Colors.dark.textSecondary }}>
              I agree to Terms & Conditions
            </Text>
          </Pressable>

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
              title={isBusy ? "Creating..." : "Sign up"}
              onPress={() => {
                if (!isBusy) {
                  onSubmit().catch(() => {
                    // error handled
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
            <Text style={{ color: Colors.dark.textSecondary }}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <Text style={{ color: Colors.primaryBlue, fontWeight: "600" }}>Login</Text>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </PremiumScreen>
  );
}
