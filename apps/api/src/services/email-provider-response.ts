export function providerMessageId(body: unknown) {
  if (!isProviderResponse(body)) {
    return undefined;
  }
  const id = body["id"];
  return typeof id === "string" && id.trim() ? id.trim().slice(0, 256) : undefined;
}

export function providerErrorMessage(body: unknown) {
  if (!isProviderResponse(body)) {
    return "Provider returned an unreadable error response.";
  }
  const message = body["message"];
  if (typeof message === "string" && message.trim()) {
    return localizedProviderMessage(message);
  }
  const name = body["name"];
  if (typeof name === "string" && name.trim()) {
    return name;
  }
  return "Provider returned an error response without a message.";
}

function localizedProviderMessage(message: string) {
  switch (message) {
    case "API key is invalid":
      return "API 키가 유효하지 않습니다.";
    case "The from address is not verified":
      return "발신자 주소가 인증되지 않았습니다.";
    default:
      return message;
  }
}

function isProviderResponse(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}
