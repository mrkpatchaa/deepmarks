/**
 * Wiki file export — Task 6.2
 *
 * Writes the wiki markdown to a given directory handle.
 * The caller is responsible for obtaining the handle via showDirectoryPicker()
 * with a user gesture.
 *
 * SECURITY:
 *   - Caller must obtain dirHandle from user gesture (File System Access API).
 *   - No auto-export; never called on load or on storage change.
 *   - The written content is sanitized markdown from compileWiki().
 */
import type { BookmarkNode } from "../bookmarks/types";
import { compileWiki } from "./compile";

/**
 * Writes the compiled wiki markdown to `bookmarks-wiki.md`
 * inside the provided directory handle.
 *
 * @param bookmarks - The full bookmark list to compile.
 * @param dirHandle - A writable FileSystemDirectoryHandle from user gesture.
 */
export async function saveWikiFile(
  bookmarks: BookmarkNode[],
  dirHandle: FileSystemDirectoryHandle,
): Promise<void> {
  const markdown = compileWiki(bookmarks);
  const fileHandle = await dirHandle.getFileHandle("bookmarks-wiki.md", {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(markdown);
  await writable.close();
}
