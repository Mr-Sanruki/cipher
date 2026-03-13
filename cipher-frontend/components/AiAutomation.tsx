import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAiAutomation } from "../hooks/useAiAutomation";

// Voice recognition types
type VoiceRecognitionStatus = "idle" | "listening" | "processing" | "success" | "error";

interface VoiceCommandModalProps {
  visible: boolean;
  onClose: () => void;
  onCommandProcessed?: (result: { intent: string; action: string; params: Record<string, any>; response: string }) => void;
}

// Wave animation component
function WaveAnimation({ isActive }: { isActive: boolean }): JSX.Element {
  const animations = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    if (!isActive) {
      animations.forEach(anim => anim.setValue(0));
      return;
    }

    const animate = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const animations_started = animations.map((anim, index) =>
      animate(anim, index * 120).start()
    );

    return () => {
      animations.forEach(anim => anim.stopAnimation());
    };
  }, [isActive, animations]);

  return (
    <View style={styles.waveContainer}>
      {animations.map((anim, index) => (
        <Animated.View
          key={index}
          style={[
            styles.waveBar,
            {
              transform: [
                {
                  scaleY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 1],
                  }),
                },
              ],
              opacity: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.4, 1],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

export function VoiceCommandModal({ visible, onClose, onCommandProcessed }: VoiceCommandModalProps): JSX.Element {
  const [status, setStatus] = useState<VoiceRecognitionStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const { executeVoiceCommand, voiceCommandResult } = useAiAutomation();

  // Pulse animation for the mic button
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === "listening") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }

    return () => {
      pulseAnim.stopAnimation();
    };
  }, [status, pulseAnim]);

  // Simulate voice recognition (in production, use native speech-to-text)
  const startListening = useCallback(() => {
    setStatus("listening");
    setTranscript("");
    setResponse("");

    // Simulate listening timeout
    setTimeout(() => {
      // In a real implementation, this would be the actual transcript
      setTranscript("Create a task to finish the report by Friday");
      setStatus("processing");

      // Process the voice command
      processCommand("Create a task to finish the report by Friday");
    }, 3000);
  }, []);

  const processCommand = useCallback(async (command: string) => {
    try {
      const result = await executeVoiceCommand(command);
      setResponse(result.response);
      setStatus("success");
      onCommandProcessed?.(result);

      // Auto close after success
      setTimeout(() => {
        onClose();
        setStatus("idle");
        setTranscript("");
        setResponse("");
      }, 2000);
    } catch (error) {
      setStatus("error");
      setResponse("Sorry, I couldn't process that command.");
    }
  }, [executeVoiceCommand, onClose, onCommandProcessed]);

  const handleClose = useCallback(() => {
    setStatus("idle");
    setTranscript("");
    setResponse("");
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={styles.container}>
          {/* Close button */}
          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Ionicons name="close" size={24} color="rgba(255,255,255,0.8)" />
          </Pressable>

          {/* Status indicator */}
          <View style={styles.statusContainer}>
            {status === "idle" && (
              <Text style={styles.statusText}>Tap the microphone to start</Text>
            )}
            {status === "listening" && (
              <>
                <WaveAnimation isActive={true} />
                <Text style={[styles.statusText, styles.listeningText]}>Listening...</Text>
              </>
            )}
            {status === "processing" && (
              <>
                <Animated.View style={styles.processingSpinner} />
                <Text style={styles.statusText}>Processing...</Text>
              </>
            )}
            {status === "success" && (
              <>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark" size={32} color="#25D366" />
                </View>
                <Text style={[styles.statusText, styles.successText]}>Done!</Text>
              </>
            )}
            {status === "error" && (
              <>
                <View style={styles.errorIcon}>
                  <Ionicons name="alert-circle" size={32} color="#FF3B30" />
                </View>
                <Text style={[styles.statusText, styles.errorText]}>Error</Text>
              </>
            )}
          </View>

          {/* Transcript display */}
          {transcript ? (
            <View style={styles.transcriptContainer}>
              <Text style={styles.transcriptLabel}>You said:</Text>
              <Text style={styles.transcriptText}>{transcript}</Text>
            </View>
          ) : null}

          {/* Response display */}
          {response ? (
            <View style={styles.responseContainer}>
              <Text style={styles.responseText}>{response}</Text>
            </View>
          ) : null}

          {/* Microphone button */}
          <View style={styles.micContainer}>
            <Animated.View
              style={[
                styles.micButtonContainer,
                status === "listening" && { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <Pressable
                onPress={startListening}
                disabled={status !== "idle" && status !== "error"}
                style={({ pressed }) => [
                  styles.micButton,
                  status === "listening" && styles.micButtonListening,
                  status === "processing" && styles.micButtonProcessing,
                  status === "success" && styles.micButtonSuccess,
                  status === "error" && styles.micButtonError,
                  pressed && styles.micButtonPressed,
                ]}
              >
                <Ionicons
                  name={status === "success" ? "checkmark" : status === "error" ? "alert-circle" : "mic"}
                  size={32}
                  color="white"
                />
              </Pressable>
            </Animated.View>
          </View>

          {/* Quick commands hint */}
          <View style={styles.hintsContainer}>
            <Text style={styles.hintsTitle}>Try saying:</Text>
            <View style={styles.hintsList}>
              <Text style={styles.hintText}>"Create a task to..."</Text>
              <Text style={styles.hintText}>"Remind me to..."</Text>
              <Text style={styles.hintText}>"Schedule a meeting..."</Text>
              <Text style={styles.hintText}>"Send a message to..."</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Smart Suggestions component
interface SmartSuggestionsProps {
  onSuggestionPress?: (suggestion: { type: string; title: string; action: string }) => void;
}

export function SmartSuggestions({ onSuggestionPress }: SmartSuggestionsProps): JSX.Element {
  const { suggestions, isAnalyzing, refreshSuggestions } = useAiAutomation();
  const [showAll, setShowAll] = useState(false);

  const displayedSuggestions = showAll ? suggestions : suggestions.slice(0, 3);

  const getIconForType = (type: string) => {
    switch (type) {
      case "task": return "checkbox-outline";
      case "habit": return "repeat-outline";
      case "calendar": return "calendar-outline";
      case "message": return "chatbubble-outline";
      case "call": return "call-outline";
      default: return "sparkles-outline";
    }
  };

  const getColorForType = (type: string) => {
    switch (type) {
      case "task": return "#25D366";
      case "habit": return "#34B7F1";
      case "calendar": return "#FFD700";
      case "message": return "#FF6B6B";
      case "call": return "#9B59B6";
      default: return "#25D366";
    }
  };

  return (
    <View style={ssStyles.container}>
      <View style={ssStyles.header}>
        <View style={ssStyles.headerLeft}>
          <Ionicons name="sparkles" size={20} color="#25D366" />
          <Text style={ssStyles.title}>Smart Suggestions</Text>
        </View>
        <Pressable
          onPress={() => refreshSuggestions({
            recentMessages: [],
            currentTasks: [],
            userHabits: [],
            calendarEvents: [],
            userPreferences: {},
          })}
          disabled={isAnalyzing}
          style={({ pressed }) => [ssStyles.refreshButton, pressed && ssStyles.refreshButtonPressed]}
        >
          <Ionicons name="refresh" size={18} color={isAnalyzing ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.8)"} />
        </Pressable>
      </View>

      {isAnalyzing ? (
        <View style={ssStyles.loadingContainer}>
          <Animated.View style={ssStyles.loadingSpinner} />
          <Text style={ssStyles.loadingText}>Analyzing your patterns...</Text>
        </View>
      ) : displayedSuggestions.length > 0 ? (
        <>
          {displayedSuggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion.id}
              onPress={() => onSuggestionPress?.(suggestion)}
              style={({ pressed }) => [
                ssStyles.suggestionCard,
                { borderLeftColor: getColorForType(suggestion.type) },
                pressed && ssStyles.suggestionCardPressed,
              ]}
            >
              <View style={ssStyles.suggestionIcon}>
                <Ionicons
                  name={getIconForType(suggestion.type) as any}
                  size={20}
                  color={getColorForType(suggestion.type)}
                />
              </View>
              <View style={ssStyles.suggestionContent}>
                <Text style={ssStyles.suggestionTitle}>{suggestion.title}</Text>
                <Text style={ssStyles.suggestionDescription} numberOfLines={2}>
                  {suggestion.description}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
            </Pressable>
          ))}

          {suggestions.length > 3 && (
            <Pressable
              onPress={() => setShowAll(!showAll)}
              style={({ pressed }) => [ssStyles.showMoreButton, pressed && ssStyles.showMoreButtonPressed]}
            >
              <Text style={ssStyles.showMoreText}>
                {showAll ? "Show less" : `Show ${suggestions.length - 3} more`}
              </Text>
            </Pressable>
          )}
        </>
      ) : (
        <View style={ssStyles.emptyContainer}>
          <Ionicons name="sparkles-outline" size={40} color="rgba(255,255,255,0.3)" />
          <Text style={ssStyles.emptyText}>No suggestions yet</Text>
          <Text style={ssStyles.emptySubtext}>
            Keep using the app to get personalized suggestions
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    backgroundColor: "#0b141a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
    minHeight: "60%",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: 8,
    zIndex: 10,
  },
  statusContainer: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 30,
    minHeight: 100,
    justifyContent: "center",
  },
  statusText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  listeningText: {
    color: "#25D366",
  },
  successText: {
    color: "#25D366",
  },
  errorText: {
    color: "#FF3B30",
  },
  waveContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 60,
    gap: 4,
  },
  waveBar: {
    width: 6,
    height: 40,
    backgroundColor: "#25D366",
    borderRadius: 3,
  },
  processingSpinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: "rgba(37,211,102,0.3)",
    borderTopColor: "#25D366",
  },
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(37,211,102,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  errorIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,59,48,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  transcriptContainer: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  transcriptLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    marginBottom: 8,
  },
  transcriptText: {
    color: "white",
    fontSize: 16,
    lineHeight: 22,
  },
  responseContainer: {
    backgroundColor: "rgba(37,211,102,0.1)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: "#25D366",
  },
  responseText: {
    color: "#25D366",
    fontSize: 16,
    lineHeight: 22,
  },
  micContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  micButtonContainer: {
    shadowColor: "#25D366",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
  },
  micButtonListening: {
    backgroundColor: "#FF3B30",
  },
  micButtonProcessing: {
    backgroundColor: "#FFD700",
  },
  micButtonSuccess: {
    backgroundColor: "#25D366",
  },
  micButtonError: {
    backgroundColor: "#FF3B30",
  },
  micButtonPressed: {
    opacity: 0.8,
  },
  hintsContainer: {
    alignItems: "center",
  },
  hintsTitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    marginBottom: 12,
  },
  hintsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  hintText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
});

const ssStyles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  refreshButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  refreshButtonPressed: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 30,
  },
  loadingSpinner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(37,211,102,0.3)",
    borderTopColor: "#25D366",
    marginBottom: 12,
  },
  loadingText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
  },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
  },
  suggestionCardPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  suggestionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionTitle: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  suggestionDescription: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    lineHeight: 18,
  },
  showMoreButton: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  showMoreButtonPressed: {
    opacity: 0.7,
  },
  showMoreText: {
    color: "#25D366",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 30,
  },
  emptyText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
  },
  emptySubtext: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
});
