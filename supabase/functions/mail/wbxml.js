// Exchange ActiveSync WBXML code pages (MS-ASWBXML), limited to mail commands.
// Unknown response tags are retained numerically, not interpreted as HTML/XML.
export const pages = {
  AirSync: [0, { Sync:5, Responses:6, Add:7, Change:8, Delete:9, Fetch:10, SyncKey:11, ClientId:12, ServerId:13, Status:14, Collection:15, Class:16, CollectionId:18, GetChanges:19, MoreAvailable:20, WindowSize:21, Commands:22, Options:23, FilterType:24, Collections:28, ApplicationData:29, DeletesAsMoves:30, SoftDelete:33, MIMESupport:34, MIMETruncation:35 }],
  Email: [2, { Attachment:5, Attachments:6, AttName:7, AttSize:8, DisplayName:16, DateReceived:15, Importance:18, MessageClass:19, Subject:20, Read:21, To:22, Cc:23, From:24, ReplyTo:25 }],
  Move: [5, { MoveItems:5, Move:6, SrcMsgId:7, SrcFldId:8, DstFldId:9, Response:10, Status:11, DstMsgId:12 }],
  FolderHierarchy: [7, { Folders:5, Folder:6, DisplayName:7, ServerId:8, ParentId:9, Type:10, Status:12, Changes:14, Add:15, Delete:16, Update:17, SyncKey:18, FolderCreate:19, FolderDelete:20, FolderUpdate:21, FolderSync:22, Count:23 }],
  AirSyncBase: [17, { BodyPreference:5, Type:6, TruncationSize:7, AllOrNone:8, Body:10, Data:11, EstimatedDataSize:12, Truncated:13, Attachments:14, Attachment:15, DisplayName:16, FileReference:17, Method:18, ContentId:19, ContentLocation:20, IsInline:21, NativeBodyType:22, ContentType:23, Preview:24 }],
  ItemOperations: [20, { ItemOperations:5, Fetch:6, Store:7, Options:8, Properties:11, Data:12, Status:13, Response:14 }],
  ComposeMail: [21, { SendMail:5, SmartForward:6, SmartReply:7, SaveInSentItems:8, ReplaceMime:9, Source:11, FolderId:12, ItemId:13, MIME:16, ClientId:17, Status:18 }],
};
const encoder = new TextEncoder(), decoder = new TextDecoder();
export const node = (name, ...children) => ({ name, children: children.flat().filter((c) => c !== null && c !== undefined) });
function integer(value) {
  const bytes = [value & 127];
  while ((value = Math.floor(value / 128))) bytes.unshift((value & 127) | 128);
  return bytes;
}
export function encode(root) {
  const chunks = [new Uint8Array([3, 1, 106, 0])];
  let currentPage = 0;
  const add = (bytes) => chunks.push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  function visit(value) {
    if (value instanceof Uint8Array) { add([195, ...integer(value.length)]); add(value); return; }
    if (typeof value !== "object") { add([3]); add(encoder.encode(String(value))); add([0]); return; }
    const [ns, name] = value.name.split(":"), definition = pages[ns];
    if (!definition || !definition[1][name]) throw new Error("Unknown ActiveSync tag");
    if (currentPage !== definition[0]) { add([0, definition[0]]); currentPage = definition[0]; }
    const content = value.children.length > 0;
    add([definition[1][name] | (content ? 64 : 0)]);
    if (content) { value.children.forEach(visit); add([1]); }
  }
  visit(root);
  const output = new Uint8Array(chunks.reduce((total, c) => total + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
export function decode(input) {
  const bytes = new Uint8Array(input), roots = [], stack = [];
  let offset = 0, page = 0, count = 0, expanded = 0;
  const byte = () => { if (offset >= bytes.length) throw new Error("Truncated WBXML"); return bytes[offset++]; };
  const readInteger = () => {
    let n = 0;
    for (let i = 0; i < 5; i++) { const b = byte(); n = n * 128 + (b & 127); if (!(b & 128)) return n; }
    throw new Error("Invalid WBXML integer");
  };
  const zeroString = (source, start) => {
    const end = source.indexOf(0, start);
    if (end < 0) throw new Error("Invalid WBXML string");
    expanded += end - start;
    if (expanded > 32 * 1024 * 1024) throw new Error("WBXML text too large");
    return { value: decoder.decode(source.subarray(start, end)), end: end + 1 };
  };
  if (byte() !== 3) throw new Error("Unsupported WBXML version");
  const publicId = readInteger();
  if (!publicId) readInteger();
  if (readInteger() !== 106) throw new Error("Unsupported WBXML charset");
  const tableLength = readInteger();
  if (offset + tableLength > bytes.length) throw new Error("Invalid WBXML table");
  const table = bytes.subarray(offset, offset += tableLength);
  const append = (value) => {
    if (++count > 150000) throw new Error("WBXML too complex");
    (stack.at(-1)?.children || roots).push(value);
  };
  while (offset < bytes.length) {
    const token = byte();
    if (token === 0) { page = byte(); continue; }
    if (token === 1) { if (!stack.length) throw new Error("Invalid WBXML end"); stack.pop(); continue; }
    if (token === 3) {
      const str = zeroString(bytes, offset); offset = str.end; append(str.value); continue;
    }
    if (token === 131) { append(zeroString(table, readInteger()).value); continue; }
    if (token === 2) { append(String.fromCodePoint(readInteger())); continue; }
    if (token === 195) {
      const length = readInteger();
      if (offset + length > bytes.length) throw new Error("Invalid WBXML opaque");
      append(bytes.slice(offset, offset += length)); continue;
    }
    if (token & 128 || (token & 63) < 5) throw new Error("Unsupported WBXML token");
    const ns = Object.keys(pages).find((name) => pages[name][0] === page);
    const tag = ns && Object.keys(pages[ns][1]).find((name) => pages[ns][1][name] === (token & 63));
    const value = node(`${ns || page}:${tag || (token & 63)}`);
    append(value);
    if (token & 64) { if (stack.length >= 64) throw new Error("WBXML too deep"); stack.push(value); }
  }
  if (stack.length || roots.length !== 1 || typeof roots[0] !== "object") throw new Error("Invalid WBXML document");
  return roots[0];
}
export const children = (value, name) => (value?.children || []).filter((c) => c?.name === name);
export const child = (value, name) => children(value, name)[0];
export function text(value) { return (value?.children || []).map((c) => typeof c === "string" ? c : c instanceof Uint8Array ? decoder.decode(c) : "").join(""); }
export const value = (parent, name) => text(child(parent, name));
export function data(value) {
  const chunks = (value?.children || []).map((c) => c instanceof Uint8Array ? c : encoder.encode(typeof c === "string" ? c : ""));
  const output = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) { output.set(c, offset); offset += c.length; }
  return output;
}
