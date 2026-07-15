export const starterCode = `function solution(input) {
  // Write your answer here.
  return input;
}`;

export interface RunnableLanguage {
  label: string;
  value: string;
  aliases: readonly string[];
}

export const runnableLanguages: readonly RunnableLanguage[] = [
  { label: "JavaScript", value: "javascript", aliases: ["javascript", "js"] },
  { label: "Python", value: "python", aliases: ["python", "py"] }
];

export function formatDuration(seconds: number | null) {
  if (seconds === null) {
    return "--:--";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
