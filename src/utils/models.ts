export class BookmarkInfo {
    id?: string | undefined = "";
    parentId?: string | undefined;
    index?: number | undefined;
    url?: string | undefined;
    title: string = "";
    dateAdded?: number | undefined;
    dateGroupModified?: number | undefined;
    dateLastUsed?: number | undefined;
    folderType?: "bookmarks-bar" | "other" | "mobile" | "managed" | undefined;
    syncing?: boolean | undefined;
    unmodifiable?: "managed" | undefined;
    type?: "bookmark" | "folder" | "separator" | undefined;
    children?: BookmarkInfo[] | undefined;
    public constructor(title: string, url?: string, children?: BookmarkInfo[]) {
        this.title = title;
        this.url = url;
        this.children = children;
    }
}
export class SyncDataInfo {
    version: string = "1.0.0";
    createDate: number = Date.now();
    bookmarks: BookmarkInfo[] | undefined = [];
}

export enum OperType { NONE, SYNC, CHANGE, CREATE, MOVE }
export enum RootBookmarksType { MenuFolder = "MenuFolder", ToolbarFolder = "ToolbarFolder", UnfiledFolder = "UnfiledFolder", MobileFolder = "MobileFolder" }
