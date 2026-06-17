import BookmarkService from '../utils/services'
import { Setting } from '../utils/setting'
import { GIST_FILE_NAME } from '../utils/constants'
import iconLogo from '../assets/icon.png'
import { OperType, BookmarkInfo, SyncDataInfo, RootBookmarksType } from '../utils/models'
import type { Browser } from 'wxt/browser'

type ActionName = 'upload' | 'download' | 'setting' | 'restore';
type RootFolderIds = Partial<Record<RootBookmarksType, string>>;
type ActionMessage = { name: ActionName; force?: boolean; revisionId?: string };
type DownloadResult = {
  status: 'success' | 'conflict' | 'noop' | 'error';
  localCount?: number;
  remoteCount?: number;
  message?: string;
};
type SyncMarker = {
  localDirty?: boolean;
};
type ComparableBookmark = {
  title: string;
  url?: string;
  children?: ComparableBookmark[];
};

function isActionMessage(message: unknown): message is ActionMessage {
  return typeof message === 'object'
    && message != null
    && 'name' in message
    && ['upload', 'download', 'setting', 'restore'].includes(String(message.name));
}

export default defineBackground(() => {
  let curOperType = OperType.NONE;
  let rootFolderIds: RootFolderIds = {};

  browser.runtime.onMessage.addListener(async (
    msg: unknown,
    _sender: Browser.runtime.MessageSender,
  ) => {
    if (!isActionMessage(msg)) {
      return undefined;
    }
    if (msg.name === 'upload') {
      curOperType = OperType.SYNC
      try {
        await uploadBookmarks();
        return true;
      } finally {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
      }
    }
    if (msg.name === 'download') {
      curOperType = OperType.SYNC
      try {
        return await downloadBookmarks(msg.force === true);
      } finally {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
      }
    }
    if (msg.name === 'restore') {
      curOperType = OperType.SYNC
      try {
        return await restoreFromRevision(msg.revisionId);
      } finally {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
      }
    }
    if (msg.name === 'setting') {
      await browser.runtime.openOptionsPage();
      return true;
    }
  });
  browser.bookmarks.onCreated.addListener(() => {
    if (curOperType === OperType.NONE) {
      // console.log("onCreated", id, info)
      markLocalDirty();
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
    }
  });
  browser.bookmarks.onChanged.addListener(() => {
    if (curOperType === OperType.NONE) {
      // console.log("onChanged", id, info)
      markLocalDirty();
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
    }
  })
  browser.bookmarks.onMoved.addListener(() => {
    if (curOperType === OperType.NONE) {
      // console.log("onMoved", id, info)
      markLocalDirty();
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
    }
  })
  browser.bookmarks.onRemoved.addListener(() => {
    if (curOperType === OperType.NONE) {
      // console.log("onRemoved", id, info)
      markLocalDirty();
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
    }
  })

  async function uploadBookmarks() {
    try {
      let setting = await Setting.build()
      if (setting.githubToken == '') {
        throw new Error("Gist Token Not Found");
      }
      if (setting.gistID == '') {
        throw new Error("Gist ID Not Found");
      }
      let bookmarks = await getBookmarks();
      let syncdata = new SyncDataInfo();
      syncdata.version = browser.runtime.getManifest().version;
      syncdata.createDate = Date.now();
      syncdata.bookmarks = formatBookmarks(bookmarks);
      const response = await BookmarkService.update({
        files: {
          [GIST_FILE_NAME]: {
            content: JSON.stringify(syncdata)
          }
        },
        description: GIST_FILE_NAME
      });
      const count = getBookmarkCount(syncdata.bookmarks);
      await browser.storage.local.set({ remoteCount: count });
      await markSyncMarker();
      if (setting.enableNotify) {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('uploadBookmarks'),
          message: browser.i18n.getMessage('success')
        });
      }

    }
    catch (error: any) {
      console.error(error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('uploadBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
    }
  }
  async function downloadBookmarks(force = false): Promise<DownloadResult> {
    try {
      let setting = await Setting.build()
      const currentGist = await BookmarkService.getCurrentGist();
      const syncdata = getSyncDataFromGist(currentGist);
      return await applySyncData(syncdata, force, setting);
    }
    catch (error: any) {
      console.error(error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('downloadBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
      return { status: 'error', message: error.message };
    }
  }

  async function restoreFromRevision(revisionId?: string): Promise<DownloadResult> {
    try {
      const setting = await Setting.build();
      if (!revisionId) {
        throw new Error('Revision ID Not Found');
      }
      const revision = await BookmarkService.getRevision(revisionId);
      const syncdata = getSyncDataFromGist(revision);
      return await applySyncData(syncdata, true, setting);
    } catch (error: any) {
      console.error(error);
      return { status: 'error', message: error.message };
    }
  }

  function getSyncDataFromGist(gist: any): SyncDataInfo {
    const file = gist?.files?.[GIST_FILE_NAME]
      ?? LEGACY_GIST_FILE_NAMES.map((name: string) => gist?.files?.[name]).find(Boolean);
    if (!file) {
      throw new Error(`Gist File ${GIST_FILE_NAME} Not Found`);
    }
    const content = file.content ?? '';
    if (!content) {
      throw new Error(`Gist File ${GIST_FILE_NAME} is NULL`);
    }
    return JSON.parse(content) as SyncDataInfo;
  }

  async function applySyncData(syncdata: SyncDataInfo, force: boolean, setting: any): Promise<DownloadResult> {
    if (syncdata.bookmarks == undefined || syncdata.bookmarks.length == 0) {
      if (setting.enableNotify) {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('downloadBookmarks'),
          message: `${browser.i18n.getMessage('error')}：Gist File ${GIST_FILE_NAME} is NULL`
        });
      }
      return { status: 'error', message: `Gist File ${GIST_FILE_NAME} is NULL` };
    }
    const localBookmarkTree = await getBookmarks();
    const localCount = getBookmarkCount(localBookmarkTree);
    const remoteCount = getBookmarkCount(syncdata.bookmarks);
    await browser.storage.local.set({ localCount, remoteCount });
    const localBookmarks = normalizeSavedBookmarksForCompare(formatBookmarks(localBookmarkTree));
    if (!force && hasComparableBookmarkData(localBookmarks)) {
      return { status: 'conflict', localCount, remoteCount };
    }
    const cleared = await clearBookmarkTree();
    if (!cleared) {
      throw new Error('Failed to clear local bookmarks');
    }
    const createErrors: string[] = [];
    await createBookmarkTree(syncdata.bookmarks, createErrors);
    if (createErrors.length > 0) {
      throw new Error(`Failed to create ${createErrors.length} bookmark item(s)`);
    }
    await browser.storage.local.set({ localCount: remoteCount, remoteCount });
    await markSyncMarker();
    if (setting.enableNotify) {
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('downloadBookmarks'),
        message: browser.i18n.getMessage('success')
      });
    }
    return { status: 'success', localCount: remoteCount, remoteCount };
  }

  async function getSyncMarker(): Promise<SyncMarker> {
    const stored = await browser.storage.local.get(['localDirty']);
    return {
      localDirty: stored.localDirty === true,
    };
  }

  async function markSyncMarker() {
    await browser.storage.local.set({ localDirty: false });
  }

  async function markLocalDirty() {
    await browser.storage.local.set({ localDirty: true });
  }

  async function getBookmarks() {
    const bookmarkTree: BookmarkInfo[] = await browser.bookmarks.getTree();
    rootFolderIds = resolveRootFolderIds(bookmarkTree);
    return bookmarkTree;
  }

  function resolveRootFolderIds(bookmarks: BookmarkInfo[]): RootFolderIds {
    const rootNodes = bookmarks[0]?.children ?? [];
    return {
      [RootBookmarksType.MenuFolder]: findRootFolderId(rootNodes, undefined, ['menu________']),
      [RootBookmarksType.ToolbarFolder]: findRootFolderId(rootNodes, 'bookmarks-bar', ['toolbar_____', '1']),
      [RootBookmarksType.UnfiledFolder]: findRootFolderId(rootNodes, 'other', ['unfiled_____', '2']),
      [RootBookmarksType.MobileFolder]: findRootFolderId(rootNodes, 'mobile', ['mobile______', '3']),
    };
  }

  function findRootFolderId(
    rootNodes: BookmarkInfo[],
    folderType: BookmarkInfo['folderType'],
    legacyIds: string[],
  ) {
    const typedNodes = folderType
      ? rootNodes.filter(node => node.folderType === folderType)
      : [];
    return typedNodes.find(node => node.syncing)?.id
      ?? typedNodes[0]?.id
      ?? rootNodes.find(node => node.id != null && legacyIds.includes(node.id))?.id;
  }

  async function clearBookmarkTree() {
    try {
      let bookmarks = await getBookmarks();
      let tempNodes: BookmarkInfo[] = [];
      bookmarks[0].children?.forEach(c => {
        c.children?.forEach(d => {
          tempNodes.push(d)
        })
      });
      if (tempNodes.length > 0) {
        for (let node of tempNodes) {
          if (node.id) {
            await browser.bookmarks.removeTree(node.id)
          }
        }
      }
      return true;
    }
    catch (error: any) {
      console.error(error);
      return false;
    }
  }

  async function createBookmarkTree(bookmarkList: BookmarkInfo[] | undefined, createErrors: string[]) {
    if (bookmarkList == null) {
      return;
    }
    for (let i = 0; i < bookmarkList.length; i++) {
      let node = bookmarkList[i];
      if (isRootBookmarkType(node.title)) {
        const parentId = getDestinationRootId(node.title);
        if (!parentId) {
          throw new Error(`Bookmark root folder not found: ${node.title}`);
        }
        node.children?.forEach(child => child.parentId = parentId);
        await createBookmarkTree(node.children, createErrors);
        continue;
      }

      try {
        const result: Browser.bookmarks.BookmarkTreeNode = await browser.bookmarks.create({
          parentId: node.parentId,
          title: node.title,
          url: node.url
        });
        if (result.id && node.children && node.children.length > 0) {
          node.children.forEach(child => child.parentId = result.id);
          await createBookmarkTree(node.children, createErrors);
        }
      } catch (err) {
        console.error(node, err);
        createErrors.push(node.title);
      }
    }
  }

  function isRootBookmarkType(title: string): title is RootBookmarksType {
    return Object.values(RootBookmarksType).includes(title as RootBookmarksType);
  }

  function getDestinationRootId(rootType: RootBookmarksType) {
    switch (rootType) {
      case RootBookmarksType.MenuFolder:
        return rootFolderIds[RootBookmarksType.MenuFolder]
          ?? rootFolderIds[RootBookmarksType.UnfiledFolder];
      case RootBookmarksType.MobileFolder:
        return rootFolderIds[RootBookmarksType.MobileFolder]
          ?? rootFolderIds[RootBookmarksType.UnfiledFolder];
      case RootBookmarksType.ToolbarFolder:
        return rootFolderIds[RootBookmarksType.ToolbarFolder]
          ?? rootFolderIds[RootBookmarksType.UnfiledFolder];
      case RootBookmarksType.UnfiledFolder:
        return rootFolderIds[RootBookmarksType.UnfiledFolder]
          ?? rootFolderIds[RootBookmarksType.ToolbarFolder];
    }
  }

  function getBookmarkCount(bookmarkList: BookmarkInfo[] | undefined) {
    let count = 0;
    if (bookmarkList) {
      bookmarkList.forEach(c => {
        if (c.url) {
          count = count + 1;
        }
        else {
          count = count + getBookmarkCount(c.children);
        }
      });
    }
    return count;
  }

  function areBookmarkTreesEqual(
    localBookmarks: ComparableBookmark[],
    remoteBookmarks: ComparableBookmark[],
  ) {
    return JSON.stringify(localBookmarks) === JSON.stringify(remoteBookmarks);
  }

  function normalizeSavedBookmarksForCompare(bookmarkList: BookmarkInfo[] | undefined): ComparableBookmark[] {
    const normalizedBookmarks: ComparableBookmark[] = [];
    const rootIndex = new Map<string, ComparableBookmark>();
    (bookmarkList ?? []).forEach(bookmark => {
        const rootType = getCompareRootType(bookmark);
        if (rootType && isEmptyRootBookmark(bookmark)) {
          return;
        }
        const comparable = normalizeBookmarkForCompare(bookmark);
        if (!rootType) {
          normalizedBookmarks.push(comparable);
          return;
        }
        comparable.title = getComparableRootTitle(rootType);
        const existingRoot = rootIndex.get(comparable.title);
        if (existingRoot) {
          existingRoot.children = [
            ...(existingRoot.children ?? []),
            ...(comparable.children ?? []),
          ];
          return;
        }
        rootIndex.set(comparable.title, comparable);
        normalizedBookmarks.push(comparable);
      });
    return normalizedBookmarks.sort((left, right) =>
      getRootCompareOrder(left.title) - getRootCompareOrder(right.title)
    );
  }

  function normalizeBookmarkForCompare(bookmark: BookmarkInfo): ComparableBookmark {
    const comparable: ComparableBookmark = {
      title: bookmark.title ?? '',
    };
    if (bookmark.url) {
      comparable.url = bookmark.url;
    }
    const children = bookmark.children?.map(normalizeBookmarkForCompare) ?? [];
    if (children.length > 0) {
      comparable.children = children;
    }
    return comparable;
  }

  function isEmptyRootBookmark(bookmark: BookmarkInfo) {
    return getCompareRootType(bookmark) != null
      && !bookmark.url
      && (!bookmark.children || bookmark.children.length === 0);
  }

  function getCompareRootType(bookmark: BookmarkInfo): RootBookmarksType | undefined {
    return getRootBookmarkType(bookmark)
      ?? (isRootBookmarkType(bookmark.title) ? bookmark.title : undefined);
  }

  function getComparableRootTitle(rootType: RootBookmarksType) {
    const destinationRootId = getDestinationRootId(rootType);
    switch (destinationRootId) {
      case rootFolderIds[RootBookmarksType.MenuFolder]:
        return RootBookmarksType.MenuFolder;
      case rootFolderIds[RootBookmarksType.MobileFolder]:
        return RootBookmarksType.MobileFolder;
      case rootFolderIds[RootBookmarksType.ToolbarFolder]:
        return RootBookmarksType.ToolbarFolder;
      case rootFolderIds[RootBookmarksType.UnfiledFolder]:
        return RootBookmarksType.UnfiledFolder;
      default:
        return rootType;
    }
  }

  function getRootCompareOrder(title: string) {
    const rootOrder = [
      RootBookmarksType.MenuFolder,
      RootBookmarksType.ToolbarFolder,
      RootBookmarksType.UnfiledFolder,
      RootBookmarksType.MobileFolder,
    ];
    const index = rootOrder.indexOf(title as RootBookmarksType);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  }

  function hasComparableBookmarkData(bookmarkList: ComparableBookmark[]) {
    return bookmarkList.some(hasComparableNodeData);
  }

  function hasComparableNodeData(bookmark: ComparableBookmark): boolean {
    return Boolean(bookmark.url)
      || Boolean(bookmark.children && bookmark.children.length > 0)
      || !isRootBookmarkType(bookmark.title);
  }

  async function refreshLocalCount() {
    let bookmarkList = await getBookmarks();
    const count = getBookmarkCount(bookmarkList);
    await browser.storage.local.set({ localCount: count });
  }


  function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    if (bookmarks[0].children) {
      for (let a of bookmarks[0].children) {
        const rootType = getRootBookmarkType(a);
        if (rootType) {
          a.title = rootType;
        }
      }
    }

    let a = format(bookmarks[0]);
    return a.children;
  }

  function getRootBookmarkType(node: BookmarkInfo): RootBookmarksType | undefined {
    switch (node.folderType) {
      case 'bookmarks-bar':
        return RootBookmarksType.ToolbarFolder;
      case 'other':
        return RootBookmarksType.UnfiledFolder;
      case 'mobile':
        return RootBookmarksType.MobileFolder;
    }
    if (node.id === 'toolbar_____' || node.id === '1') {
      return RootBookmarksType.ToolbarFolder;
    }
    if (node.id === 'menu________') {
      return RootBookmarksType.MenuFolder;
    }
    if (node.id === 'unfiled_____' || node.id === '2') {
      return RootBookmarksType.UnfiledFolder;
    }
    if (node.id === 'mobile______' || node.id === '3') {
      return RootBookmarksType.MobileFolder;
    }
  }

  function format(b: BookmarkInfo): BookmarkInfo {
    b.dateAdded = undefined;
    b.dateGroupModified = undefined;
    b.dateLastUsed = undefined;
    b.folderType = undefined;
    b.id = undefined;
    b.index = undefined;
    b.parentId = undefined;
    b.syncing = undefined;
    b.type = undefined;
    b.unmodifiable = undefined;
    if (b.children && b.children.length > 0) {
      b.children?.map(c => format(c))
    }
    return b;
  }
  ///暂时不启用自动备份
  /*
  async function backupToLocalStorage(bookmarks: BookmarkInfo[]) {
      try {
          let syncdata = new SyncDataInfo();
          syncdata.version = browser.runtime.getManifest().version;
          syncdata.createDate = Date.now();
          syncdata.bookmarks = formatBookmarks(bookmarks);
          const keyname = 'BookmarkHub_backup_' + Date.now().toString();
          await browser.storage.local.set({ [keyname]: JSON.stringify(syncdata) });
      }
      catch (error:any) {
          console.error(error)
      }
  }
  */

});
