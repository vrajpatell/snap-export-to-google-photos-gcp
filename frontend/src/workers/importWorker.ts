import { sha256Blob } from "@/lib/browser/hash";
import { inspectMediaBlob } from "@/lib/browser/mediaQuality";

type WorkerRequest = { id: string; type: "prepareMediaItem"; blob: Blob; filename: string } | { id: string; type: "cancel" };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") return;
  try {
    const [quality, sha256] = await Promise.all([
      inspectMediaBlob(message.blob, message.filename),
      sha256Blob(message.blob),
    ]);
    self.postMessage({ id: message.id, type: "prepared", quality, sha256 });
  } catch (error) {
    self.postMessage({ id: message.id, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
