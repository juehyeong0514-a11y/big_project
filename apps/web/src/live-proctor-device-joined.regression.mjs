import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), "LiveProctorDashboard.tsx");
const source = readFileSync(sourcePath, "utf8");

if (!source.includes('socket.on("device-joined"')) {
  throw new Error("LiveProctorDashboard must listen for device-joined events.");
}

const deviceJoinedHandler = source.slice(source.indexOf('socket.on("device-joined"'));
const deviceJoinedBlock = deviceJoinedHandler.slice(0, deviceJoinedHandler.indexOf('socket.on("device-left"'));

if (!deviceJoinedBlock.includes('socket.emit("request-offer"')) {
  throw new Error("device-joined handler must immediately request a WebRTC offer.");
}

for (const requiredField of ["examId", "candidateId", "deviceRole"]) {
  if (!deviceJoinedBlock.includes(requiredField)) {
    throw new Error(`device-joined request-offer payload is missing ${requiredField}.`);
  }
}
