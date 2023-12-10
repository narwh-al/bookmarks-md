import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';

export function activate(context: vscode.ExtensionContext) {
    console.log('Your extension "bookmarks-md" is now active!');

    const bookmarksDataProvider = new BookmarksDataProvider();
    vscode.window.registerTreeDataProvider('bookmarksView', bookmarksDataProvider);

    let openLinkDisposable = vscode.commands.registerCommand('bookmarks-md.openLink', (link: string) => {
        vscode.env.openExternal(vscode.Uri.parse(link));
    });

    let interval = setInterval(() => {
        bookmarksDataProvider.refresh();
    }, 3000);

    context.subscriptions.push(openLinkDisposable, {
        dispose() {
            clearInterval(interval);
        }
    });

    let createBookmarksFileDisposable = vscode.commands.registerCommand('bookmarks-md.createBookmarksFile', createBookmarksFile);
    context.subscriptions.push(createBookmarksFileDisposable);
}

abstract class BookmarkBase extends vscode.TreeItem {
    children?: BookmarkBase[];

    constructor(public readonly title: string, public readonly collapsibleState: vscode.TreeItemCollapsibleState) {
        super(title, collapsibleState);
    }
}

class NoBookmarksItem extends BookmarkBase {
    constructor() {
        super("Create BOOKMARKS.md", vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: 'bookmarks-md.createBookmarksFile',
            title: 'Create BOOKMARKS.md'
        };
    }
}

class BookmarkItem extends BookmarkBase {
    constructor(title: string, public readonly link: string) {
        super(title, vscode.TreeItemCollapsibleState.None);
        this.command = { 
            command: 'bookmarks-md.openLink', 
            title: 'Open Link', 
            arguments: [this.link]
        };
    }
}

class BookmarksDataProvider implements vscode.TreeDataProvider<BookmarkBase> {
    private _onDidChangeTreeData: vscode.EventEmitter<BookmarkBase | undefined> = new vscode.EventEmitter<BookmarkBase | undefined>();
    readonly onDidChangeTreeData: vscode.Event<BookmarkBase | undefined> = this._onDidChangeTreeData.event;

    private bookmarks: BookmarkBase[] = [];

    constructor() {
        this.refresh();
    }

    refresh(): void {
        const content = readBookmarksFile();
        if (content) {
            this.bookmarks = extractBookmarks(content);
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    getTreeItem(element: BookmarkBase): vscode.TreeItem {
        return element;
    }

    getChildren(element?: BookmarkBase): Thenable<BookmarkBase[]> {
        if (!element) {
            const content = readBookmarksFile();
            if (!content) {
                // Return a Promise resolved with an array containing NoBookmarksItem
                return Promise.resolve([new NoBookmarksItem()]);
            }
            this.bookmarks = extractBookmarks(content);
        }
        return Promise.resolve(element ? element.children ?? [] : this.bookmarks);
    }

}

function readBookmarksFile(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return null;
    }

    const bookmarksFilePath = path.join(workspaceFolders[0].uri.fsPath, 'BOOKMARKS.md');
    if (fs.existsSync(bookmarksFilePath)) {
        return fs.readFileSync(bookmarksFilePath, 'utf-8');
    }

    return null;
}

function extractBookmarks(markdownContent: string): BookmarkBase[] {
    const bookmarks: BookmarkBase[] = [];
    const renderer = new marked.Renderer();
    let directoryStack: DirectoryItem[] = []; // Stack to keep track of directories

    renderer.heading = (text: string, level: number) => {
        // Pop from stack until a directory of a lower level is found
        while (directoryStack.length > 0 && level <= directoryStack[directoryStack.length - 1].level) {
            directoryStack.pop();
        }

        let newDirectory = new DirectoryItem(text, level);
        if (directoryStack.length > 0) {
            const parentDir = directoryStack[directoryStack.length - 1];
            parentDir.children.push(newDirectory);
        } else {
            bookmarks.push(newDirectory);
        }

        directoryStack.push(newDirectory);
        return '';
    };

    renderer.link = (href: string, title: string, text: string) => {
        const linkItem = new BookmarkItem(text, href);
        if (directoryStack.length > 0) {
            const currentDir = directoryStack[directoryStack.length - 1];
            currentDir.children.push(linkItem);
        } else {
            bookmarks.push(linkItem);
        }
        return '';
    };

    marked(markdownContent, { renderer });

    return bookmarks;
}

function createBookmarksFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
    }
    const bookmarksFilePath = path.join(workspaceFolders[0].uri.fsPath, 'BOOKMARKS.md');
    const defaultContent = `# Default Bookmark\n- [Good for Now](https://www.example.com)\n`;
    fs.writeFile(bookmarksFilePath, defaultContent, (err) => {
        if (err) {
            vscode.window.showErrorMessage(`Error creating BOOKMARKS.md: ${err.message}`);
        } else {
            vscode.window.showInformationMessage('BOOKMARKS.md created successfully!');
        }
    });
}
class DirectoryItem extends BookmarkBase {
    children: BookmarkBase[];
    level: number;

    constructor(title: string, level: number) {
        super(title, vscode.TreeItemCollapsibleState.Collapsed);
        this.children = [];
        this.level = level;
    }
}



export function deactivate() {}
