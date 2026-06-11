import BookmarkService from '../utils/services'
import { Setting } from '../utils/setting'
import { GIST_FILE_NAME } from '../utils/constants'
import iconLogo from '../assets/icon.png'
import { OperType, BookmarkInfo, SyncDataInfo, RootBookmarksType } from '../utils/models'
import type { Browser } from 'wxt/browser'

type ActionName = 'upload' | 'download' | 'setting';
type RootFolderIds = Partial<Record<RootBookmarksType, string>>;

function isActionMessage(message: unknown): message is { name: ActionName } {
  return typeof message === 'object'
    && message != null
    && 'name' in message
    && ['upload', 'download', 'setting'].includes(String(message.name));
}

export default defineBackground(() => {
  let curOperType = OperType.NONE;
  let rootFolderIds: RootFolderIds = {};

  browser.runtime.onMessage.addListener((
    msg: unknown,
    _sender: Browser.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    if (!isActionMessage(msg)) {
      return true;
    }
    if (msg.name === 'upload') {
      curOperType = OperType.SYNC
      uploadBookmarks().then(() => {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
        sendResponse(true);
      });
    }
    if (msg.name === 'download') {
      curOperType = OperType.SYNC
      downloadBookmarks().then(() => {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
        sendResponse(true);
      });

    }
    if (msg.name === 'setting') {
      browser.runtime.openOptionsPage().then(() => {
        sendResponse(true);
      });
    }
    return true;
  });
  browser.bookmarks.onCreated.addListener(() => {
    if (curOperType === OperType.NONE) {
      // console.log("onCreated", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
    }
  });
  browser.bookmarks.onChanged.addListener(() => {
    if (curOperType === OperType.NONE) {
      // console.log("onChanged", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
    }
  })
  browser.bookmarks.onMoved.addListener(() => {
    if (curOperType === OperType.NONE) {
      // console.log("onMoved", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
    }
  })
  browser.bookmarks.onRemoved.addListener(() => {
    if (curOperType === OperType.NONE) {
      // console.log("onRemoved", id, info)
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
      await BookmarkService.update({
        files: {
          [GIST_FILE_NAME]: {
            content: JSON.stringify(syncdata)
          }
        },
        description: GIST_FILE_NAME
      });
      const count = getBookmarkCount(syncdata.bookmarks);
      await browser.storage.local.set({ remoteCount: count });
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
  async function downloadBookmarks() {
    try {
      let gist = await BookmarkService.get();
      let setting = await Setting.build()
      if (gist) {
        let syncdata: SyncDataInfo = JSON.parse(gist);
        if (syncdata.bookmarks == undefined || syncdata.bookmarks.length == 0) {
          if (setting.enableNotify) {
            await browser.notifications.create({
              type: "basic",
              iconUrl: iconLogo,
              title: browser.i18n.getMessage('downloadBookmarks'),
              message: `${browser.i18n.getMessage('error')}：Gist File ${GIST_FILE_NAME} is NULL`
            });
          }
          return;
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
        const count = getBookmarkCount(syncdata.bookmarks);
        await browser.storage.local.set({ remoteCount: count });
        if (setting.enableNotify) {
          await browser.notifications.create({
            type: "basic",
            iconUrl: iconLogo,
            title: browser.i18n.getMessage('downloadBookmarks'),
            message: browser.i18n.getMessage('success')
          });
        }
      }
      else {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('downloadBookmarks'),
          message: `${browser.i18n.getMessage('error')}：Gist File ${GIST_FILE_NAME} Not Found`
        });
      }
    }
    catch (error: any) {
      console.error(error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('downloadBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
    }
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
