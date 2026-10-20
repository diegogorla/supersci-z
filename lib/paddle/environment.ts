export type PaddleEnvironment = "sandbox" | "live";

const clientTokenPattern = /^(test|live)_[a-zA-Z0-9]{27}$/;

export function isPaddleClientTokenForEnvironment(token: string, environment: PaddleEnvironment) {
  if (!clientTokenPattern.test(token)) return false;
  return environment === "live" ? token.startsWith("live_") : token.startsWith("test_");
}
