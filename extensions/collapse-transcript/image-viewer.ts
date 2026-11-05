import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface ViewableImage {
	data: string;
	mimeType: string;
}

/** Open the supplied bytes at full resolution; the desktop viewer owns zoom/pan. */
export async function openImage(image: ViewableImage, exec: ExtensionAPI["exec"]): Promise<void> {
	const extensions: Record<string, string> = {
		"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
		"image/webp": "webp", "image/bmp": "bmp", "image/tiff": "tiff", "image/avif": "avif",
	};
	const extension = extensions[image.mimeType];
	if (!extension) throw new Error(`Unsupported image type: ${image.mimeType}`);
	const directory = await mkdtemp(join(tmpdir(), "pi-tool-image-"));
	const path = join(directory, `image.${extension}`);
	await writeFile(path, Buffer.from(image.data, "base64"), { mode: 0o600 });
	// Desktop launchers return before the viewer reads the file. Leave it in the OS temp directory.
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
	const result = await exec(command, [path], { timeout: 10_000 });
	if (result.code !== 0) throw new Error(result.stderr.trim() || `${command} exited with code ${result.code}`);
}
