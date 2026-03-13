import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeUserPatterns,
  autoScheduleTasks,
  generateHabitRecommendations,
  generateSmartReplies,
  processVoiceCommand,
  summarizeAndExtractActions,
  type AiContext,
  type AutomationTask,
  type SmartSuggestion,
} from "../services/ai";
import { useAuth } from "../hooks/useAuth";

export type AutomationIntent =
  | "create_task"
  | "send_message"
  | "schedule_call"
  | "set_reminder"
  | "search"
  | "other";

export type VoiceCommandResult = {
  intent: AutomationIntent;
  action: string;
  params: Record<string, any>;
  response: string;
};

export type AiAutomationState = {
  suggestions: SmartSuggestion[];
  isAnalyzing: boolean;
  lastAnalysis: string | null;
  voiceCommandResult: VoiceCommandResult | null;
  smartReplies: string[];
  isGeneratingReplies: boolean;
};

export type AiAutomationContextValue = AiAutomationState & {
  refreshSuggestions: (context: AiContext) => Promise<void>;
  executeVoiceCommand: (transcript: string) => Promise<VoiceCommandResult>;
  getSmartReplies: (
    messageHistory: { role: "user" | "assistant"; content: string }[],
    currentMessage: string,
    tone?: "professional" | "casual" | "friendly"
  ) => Promise<string[]>;
  autoSchedule: (tasks: AutomationTask[], calendarEvents: { startTime: string; endTime: string }[]) => Promise<AutomationTask[]>;
  summarizeMessages: (messages: { sender: string; content: string }[]) => Promise<{
    summary: string;
    actionItems: string[];
    priority: "high" | "medium" | "low";
  }>;
  getHabitRecommendations: (
    existingHabits: { name: string; streak: number }[],
    userGoals: string[]
  ) => Promise<{ name: string; description: string; frequency: string; reason: string }[]>;
  clearVoiceResult: () => void;
};

const AiAutomationContext = createContext<AiAutomationContextValue | null>(null);

export function useAiAutomation(): AiAutomationContextValue {
  const ctx = useContext(AiAutomationContext);
  if (!ctx) {
    throw new Error("useAiAutomation must be used within AiAutomationProvider");
  }
  return ctx;
}

export function AiAutomationProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { user } = useAuth();
  
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<string | null>(null);
  const [voiceCommandResult, setVoiceCommandResult] = useState<VoiceCommandResult | null>(null);
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);

  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const refreshSuggestions = useCallback(async (context: AiContext) => {
    if (isAnalyzing) return;
    
    setIsAnalyzing(true);
    try {
      const newSuggestions = await analyzeUserPatterns(context);
      setSuggestions(newSuggestions);
      setLastAnalysis(new Date().toISOString());
    } catch (error) {
      console.error("Failed to refresh suggestions:", error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing]);

  const executeVoiceCommand = useCallback(async (transcript: string): Promise<VoiceCommandResult> => {
    try {
      const result = await processVoiceCommand(transcript);
      const typedResult: VoiceCommandResult = {
        intent: result.intent as AutomationIntent,
        action: result.action,
        params: result.params,
        response: result.response,
      };
      setVoiceCommandResult(typedResult);
      return typedResult;
    } catch (error) {
      console.error("Voice command failed:", error);
      const fallback: VoiceCommandResult = {
        intent: "other",
        action: "none",
        params: {},
        response: "Sorry, I didn't understand that. Could you try again?",
      };
      setVoiceCommandResult(fallback);
      return fallback;
    }
  }, []);

  const getSmartReplies = useCallback(async (
    messageHistory: { role: "user" | "assistant"; content: string }[],
    currentMessage: string,
    tone: "professional" | "casual" | "friendly" = "professional"
  ): Promise<string[]> => {
    setIsGeneratingReplies(true);
    try {
      const replies = await generateSmartReplies(messageHistory, currentMessage, tone);
      setSmartReplies(replies);
      return replies;
    } catch (error) {
      console.error("Failed to generate smart replies:", error);
      return [];
    } finally {
      setIsGeneratingReplies(false);
    }
  }, []);

  const autoSchedule = useCallback(async (
    tasks: AutomationTask[],
    calendarEvents: { startTime: string; endTime: string }[]
  ): Promise<AutomationTask[]> => {
    try {
      return await autoScheduleTasks(tasks, calendarEvents);
    } catch (error) {
      console.error("Auto-scheduling failed:", error);
      return tasks;
    }
  }, []);

  const summarizeMessages = useCallback(async (messages: { sender: string; content: string }[]) => {
    try {
      return await summarizeAndExtractActions(messages);
    } catch (error) {
      console.error("Message summarization failed:", error);
      return { summary: "", actionItems: [], priority: "low" as const };
    }
  }, []);

  const getHabitRecommendations = useCallback(async (
    existingHabits: { name: string; streak: number }[],
    userGoals: string[]
  ) => {
    try {
      return await generateHabitRecommendations(existingHabits, userGoals);
    } catch (error) {
      console.error("Failed to get habit recommendations:", error);
      return [];
    }
  }, []);

  const clearVoiceResult = useCallback(() => {
    setVoiceCommandResult(null);
  }, []);

  const value = useMemo<AiAutomationContextValue>(
    () => ({
      suggestions,
      isAnalyzing,
      lastAnalysis,
      voiceCommandResult,
      smartReplies,
      isGeneratingReplies,
      refreshSuggestions,
      executeVoiceCommand,
      getSmartReplies,
      autoSchedule,
      summarizeMessages,
      getHabitRecommendations,
      clearVoiceResult,
    }),
    [
      suggestions,
      isAnalyzing,
      lastAnalysis,
      voiceCommandResult,
      smartReplies,
      isGeneratingReplies,
      refreshSuggestions,
      executeVoiceCommand,
      getSmartReplies,
      autoSchedule,
      summarizeMessages,
      getHabitRecommendations,
      clearVoiceResult,
    ]
  );

  return (
    <AiAutomationContext.Provider value={value}>
      {children}
    </AiAutomationContext.Provider>
  );
}
