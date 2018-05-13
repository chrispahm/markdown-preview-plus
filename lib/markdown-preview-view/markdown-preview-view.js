"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const atom_1 = require("atom");
const _ = require("lodash");
const fs = require("fs");
const renderer = require("../renderer");
const markdownIt = require("../markdown-it-helper");
const imageWatcher = require("../image-watch-helper");
const util_1 = require("../util");
const util = require("./util");
class MarkdownPreviewView {
    constructor(defaultRenderMode = 'normal', renderLaTeX = util_1.atomConfig().mathConfig
        .enableLatexRenderingByDefault) {
        this.defaultRenderMode = defaultRenderMode;
        this.renderLaTeX = renderLaTeX;
        this.emitter = new atom_1.Emitter();
        this.disposables = new atom_1.CompositeDisposable();
        this.destroyed = false;
        this.loading = true;
        this.zoomLevel = 0;
        this.replyCallbacks = new Map();
        this.replyCallbackId = 0;
        this.changeHandler = () => {
            util_1.handlePromise(this.renderMarkdown());
            const pane = atom.workspace.paneForItem(this);
            if (pane !== undefined && pane !== atom.workspace.getActivePane()) {
                pane.activateItem(this);
            }
        };
        this.element = document.createElement('webview');
        this.element.getModel = () => this;
        this.element.classList.add('markdown-preview-plus', 'native-key-bindings');
        this.element.disablewebsecurity = 'true';
        this.element.nodeintegration = 'true';
        this.element.src = `file:///${__dirname}/../../client/template.html`;
        this.element.style.width = '100%';
        this.element.style.height = '100%';
        this.disposables.add(atom.styles.onDidAddStyleElement(() => {
            this.updateStyles();
        }), atom.styles.onDidRemoveStyleElement(() => {
            this.updateStyles();
        }), atom.styles.onDidUpdateStyleElement(() => {
            this.updateStyles();
        }));
        this.handleEvents();
        this.element.addEventListener('ipc-message', (e) => {
            switch (e.channel) {
                case 'zoom-in':
                    atom.commands.dispatch(this.element, 'markdown-preview-plus:zoom-in');
                    break;
                case 'zoom-out':
                    atom.commands.dispatch(this.element, 'markdown-preview-plus:zoom-out');
                    break;
                case 'open-source':
                    this.openSource(e.args[0].initialLine);
                    break;
                case 'did-scroll-preview':
                    const { min, max } = e.args[0];
                    this.didScrollPreview(min, max);
                    break;
                case 'reload':
                    this.element.reload();
                    break;
                case 'request-reply': {
                    const { id, request, result } = e.args[0];
                    const cb = this.replyCallbacks.get(id);
                    if (cb && request === cb.request) {
                        const callback = cb.callback;
                        callback(result);
                    }
                    break;
                }
            }
        });
        this.element.addEventListener('will-navigate', async (e) => {
            const { shell } = await Promise.resolve().then(() => require('electron'));
            const fileUriToPath = await Promise.resolve().then(() => require('file-uri-to-path'));
            if (e.url.startsWith('file://')) {
                util_1.handlePromise(atom.workspace.open(fileUriToPath(e.url)));
            }
            else {
                shell.openExternal(e.url);
            }
        });
        this.renderPromise = new Promise((resolve) => {
            const onload = () => {
                if (this.destroyed)
                    return;
                this.element.setZoomLevel(this.zoomLevel);
                this.updateStyles();
                this.element.send('use-github-style', {
                    value: atom.config.get('markdown-preview-plus.useGitHubStyle'),
                });
                this.element.send('set-atom-home', {
                    home: atom.getConfigDirPath(),
                });
                this.element.send('set-number-eqns', {
                    numberEqns: util_1.atomConfig().mathConfig.numberEquations,
                });
                this.element.send('set-base-path', {
                    path: this.getPath(),
                });
                this.emitter.emit('did-change-title');
                resolve(this.renderMarkdown());
            };
            this.element.addEventListener('dom-ready', onload);
        });
    }
    async runJS(js) {
        return new Promise((resolve) => this.element.executeJavaScript(js, false, resolve));
    }
    async getHTMLSVG() {
        return this.runRequest('get-html-svg');
    }
    destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        const path = this.getPath();
        path && imageWatcher.removeFile(path);
        this.disposables.dispose();
        this.element.remove();
    }
    onDidChangeTitle(callback) {
        return this.emitter.on('did-change-title', callback);
    }
    onDidChangeMarkdown(callback) {
        return this.emitter.on('did-change-markdown', callback);
    }
    toggleRenderLatex() {
        this.renderLaTeX = !this.renderLaTeX;
        this.changeHandler();
    }
    async refreshImages(oldsrc) {
        const v = await imageWatcher.getVersion(oldsrc, this.getPath());
        this.element.send('update-images', { oldsrc, v });
    }
    getDefaultLocation() {
        return util_1.atomConfig().previewConfig.previewDock;
    }
    getIconName() {
        return 'markdown';
    }
    getSaveDialogOptions() {
        let defaultPath = this.getPath();
        if (defaultPath === undefined) {
            const projectPath = atom.project.getPaths()[0];
            defaultPath = 'untitled.md';
            if (projectPath) {
                defaultPath = path.join(projectPath, defaultPath);
            }
        }
        defaultPath += '.' + util_1.atomConfig().saveConfig.defaultSaveFormat;
        return { defaultPath };
    }
    saveAs(filePath) {
        if (filePath === undefined)
            return;
        if (this.loading)
            throw new Error('Preview is still loading');
        const { name, ext } = path.parse(filePath);
        if (ext === '.pdf') {
            this.element.printToPDF({}, (error, data) => {
                if (error) {
                    atom.notifications.addError('Failed saving to PDF', {
                        description: error.toString(),
                        dismissable: true,
                        stack: error.stack,
                    });
                    return;
                }
                fs.writeFileSync(filePath, data);
            });
        }
        else {
            util_1.handlePromise(this.getHTMLToSave(filePath).then(async (html) => {
                const fullHtml = util.mkHtml(name, html, this.renderLaTeX, atom.config.get('markdown-preview-plus.useGitHubStyle'), await this.runRequest('get-tex-config'));
                fs.writeFileSync(filePath, fullHtml);
                return atom.workspace.open(filePath);
            }));
        }
    }
    didScrollPreview(_min, _max) {
    }
    openSource(initialLine) {
        const path = this.getPath();
        if (path === undefined)
            return;
        util_1.handlePromise(atom.workspace.open(path, {
            initialLine,
            searchAllPanes: true,
        }));
    }
    syncPreview(line) {
        this.element.send('sync', { line });
    }
    openNewWindow() {
        const path = this.getPath();
        if (!path) {
            atom.notifications.addWarning('Can not open this preview in new window: no file path');
            return;
        }
        atom.open({
            pathsToOpen: [`markdown-preview-plus://file/${path}`],
            newWindow: true,
        });
        util.destroy(this);
    }
    handleEvents() {
        this.disposables.add(atom.grammars.onDidAddGrammar(() => _.debounce(() => {
            util_1.handlePromise(this.renderMarkdown());
        }, 250)), atom.grammars.onDidUpdateGrammar(_.debounce(() => {
            util_1.handlePromise(this.renderMarkdown());
        }, 250)));
        this.disposables.add(atom.commands.add(this.element, {
            'core:move-up': () => this.element.scrollBy({ top: -10 }),
            'core:move-down': () => this.element.scrollBy({ top: 10 }),
            'core:copy': (event) => {
                if (this.copyToClipboard())
                    event.stopPropagation();
            },
            'markdown-preview-plus:open-dev-tools': () => {
                this.element.openDevTools();
            },
            'markdown-preview-plus:new-window': () => {
                this.openNewWindow();
            },
            'markdown-preview-plus:print': () => {
                this.element.print();
            },
            'markdown-preview-plus:zoom-in': () => {
                this.zoomLevel += 0.1;
                this.element.setZoomLevel(this.zoomLevel);
            },
            'markdown-preview-plus:zoom-out': () => {
                this.zoomLevel -= 0.1;
                this.element.setZoomLevel(this.zoomLevel);
            },
            'markdown-preview-plus:reset-zoom': () => {
                this.zoomLevel = 0;
                this.element.setZoomLevel(this.zoomLevel);
            },
            'markdown-preview-plus:sync-source': async (_event) => {
                this.element.send('sync-source', undefined);
            },
        }));
        this.disposables.add(atom.config.onDidChange('markdown-preview-plus.markdownItConfig', () => {
            if (util_1.atomConfig().renderer === 'markdown-it')
                this.changeHandler();
        }), atom.config.onDidChange('markdown-preview-plus.pandocConfig', () => {
            if (util_1.atomConfig().renderer === 'pandoc')
                this.changeHandler();
        }), atom.config.onDidChange('markdown-preview-plus.mathConfig.latexRenderer', this.changeHandler), atom.config.onDidChange('markdown-preview-plus.mathConfig.numberEquations', () => {
            this.element.send('reload', undefined);
        }), atom.config.onDidChange('markdown-preview-plus.renderer', this.changeHandler), atom.config.onDidChange('markdown-preview-plus.useGitHubStyle', ({ newValue }) => {
            this.element.send('use-github-style', {
                value: newValue,
            });
        }));
    }
    async renderMarkdown() {
        const source = await this.getMarkdownSource();
        await this.renderMarkdownText(source);
    }
    async getHTMLToSave(savePath) {
        const source = await this.getMarkdownSource();
        return renderer.render(source, this.getPath(), this.getGrammar(), this.renderLaTeX, 'save', savePath);
    }
    async renderMarkdownText(text) {
        try {
            const domDocument = await renderer.render(text, this.getPath(), this.getGrammar(), this.renderLaTeX, this.defaultRenderMode);
            if (this.destroyed)
                return;
            this.loading = false;
            this.element.send('update-preview', {
                html: domDocument.documentElement.outerHTML,
                renderLaTeX: this.renderLaTeX,
                mjrenderer: util_1.atomConfig().mathConfig.latexRenderer,
            });
            this.element.send('set-source-map', {
                map: util.buildLineMap(markdownIt.getTokens(text, this.renderLaTeX)),
            });
            this.emitter.emit('did-change-markdown');
        }
        catch (error) {
            this.showError(error);
        }
    }
    showError(error) {
        if (this.destroyed) {
            atom.notifications.addFatalError('Error reported on a destroyed Markdown Preview Plus view', {
                dismissable: true,
                stack: error.stack,
                detail: error.message,
            });
            return;
        }
        this.element.send('error', { msg: error.message });
    }
    copyToClipboard() {
        if (this.loading) {
            return false;
        }
        const selection = window.getSelection();
        const selectedText = selection.toString();
        const selectedNode = selection.baseNode;
        if (selectedText &&
            selectedNode != null) {
            return false;
        }
        util_1.handlePromise(this.getMarkdownSource().then(async (src) => util_1.copyHtml(src, this.getPath(), this.renderLaTeX)));
        return true;
    }
    updateStyles() {
        const styles = [];
        for (const se of atom.styles.getStyleElements()) {
            styles.push(se.innerHTML);
        }
        this.element.send('style', { styles });
    }
}
exports.MarkdownPreviewView = MarkdownPreviewView;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Rvd24tcHJldmlldy12aWV3LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL21hcmtkb3duLXByZXZpZXctdmlldy9tYXJrZG93bi1wcmV2aWV3LXZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSw2QkFBNkI7QUFDN0IsK0JBTWE7QUFDYiw0QkFBNEI7QUFDNUIseUJBQXlCO0FBR3pCLHdDQUF3QztBQUN4QyxvREFBb0Q7QUFDcEQsc0RBQXNEO0FBQ3RELGtDQUE2RDtBQUM3RCwrQkFBOEI7QUFhOUI7SUF1QkUsWUFDVSxvQkFBMEQsUUFBUSxFQUNsRSxjQUF1QixpQkFBVSxFQUFFLENBQUMsVUFBVTtTQUNuRCw2QkFBNkI7UUFGeEIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFpRDtRQUNsRSxnQkFBVyxHQUFYLFdBQVcsQ0FDYTtRQXZCeEIsWUFBTyxHQUdaLElBQUksY0FBTyxFQUFFLENBQUE7UUFDUixnQkFBVyxHQUFHLElBQUksMEJBQW1CLEVBQUUsQ0FBQTtRQUN2QyxjQUFTLEdBQUcsS0FBSyxDQUFBO1FBRW5CLFlBQU8sR0FBWSxJQUFJLENBQUE7UUFDdkIsY0FBUyxHQUFHLENBQUMsQ0FBQTtRQUNiLG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBUTdCLENBQUE7UUFDSyxvQkFBZSxHQUFHLENBQUMsQ0FBQTtRQTZNakIsa0JBQWEsR0FBRyxHQUFHLEVBQUU7WUFDN0Isb0JBQWEsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQTtZQUVwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQTtZQUM3QyxJQUFJLElBQUksS0FBSyxTQUFTLElBQUksSUFBSSxLQUFLLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFLEVBQUU7Z0JBQ2pFLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUE7YUFDeEI7UUFDSCxDQUFDLENB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cmVxdWlyZSgncGF0aCcpXG5pbXBvcnQge1xuICBDb21tYW5kRXZlbnQsXG4gIEVtaXR0ZXIsXG4gIERpc3Bvc2FibGUsXG4gIENvbXBvc2l0ZURpc3Bvc2FibGUsXG4gIEdyYW1tYXIsXG59IGZyb20gJ2F0b20nXG5pbXBvcnQgXyA9IHJlcXVpcmUoJ2xvZGFzaCcpXG5pbXBvcnQgZnMgPSByZXF1aXJlKCdmcycpXG5pbXBvcnQge30gZnJvbSAnZWxlY3Ryb24nIC8vIHRoaXMgaXMgaGVyZSBzb2xleSBmb3IgdHlwaW5nc1xuXG5pbXBvcnQgcmVuZGVyZXIgPSByZXF1aXJlKCcuLi9yZW5kZXJlcicpXG5pbXBvcnQgbWFya2Rvd25JdCA9IHJlcXVpcmUoJy4uL21hcmtkb3duLWl0LWhlbHBlcicpXG5pbXBvcnQgaW1hZ2VXYXRjaGVyID0gcmVxdWlyZSgnLi4vaW1hZ2Utd2F0Y2gtaGVscGVyJylcbmltcG9ydCB7IGhhbmRsZVByb21pc2UsIGNvcHlIdG1sLCBhdG9tQ29uZmlnIH0gZnJvbSAnLi4vdXRpbCdcbmltcG9ydCAqIGFzIHV0aWwgZnJvbSAnLi91dGlsJ1xuaW1wb3J0IHsgUmVxdWVzdFJlcGx5TWFwIH0gZnJvbSAnLi4vLi4vc3JjLWNsaWVudC9pcGMnXG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZE1QViB7XG4gIGRlc2VyaWFsaXplcjogJ21hcmtkb3duLXByZXZpZXctcGx1cy9NYXJrZG93blByZXZpZXdWaWV3J1xuICBlZGl0b3JJZD86IG51bWJlclxuICBmaWxlUGF0aD86IHN0cmluZ1xufVxuXG5leHBvcnQgdHlwZSBNYXJrZG93blByZXZpZXdWaWV3RWxlbWVudCA9IEVsZWN0cm9uLldlYnZpZXdUYWcgJiB7XG4gIGdldE1vZGVsKCk6IE1hcmtkb3duUHJldmlld1ZpZXdcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIE1hcmtkb3duUHJldmlld1ZpZXcge1xuICBwdWJsaWMgcmVhZG9ubHkgcmVuZGVyUHJvbWlzZTogUHJvbWlzZTx2b2lkPlxuICBwdWJsaWMgcmVhZG9ubHkgZWxlbWVudDogTWFya2Rvd25QcmV2aWV3Vmlld0VsZW1lbnRcbiAgcHJvdGVjdGVkIGVtaXR0ZXI6IEVtaXR0ZXI8e1xuICAgICdkaWQtY2hhbmdlLXRpdGxlJzogdW5kZWZpbmVkXG4gICAgJ2RpZC1jaGFuZ2UtbWFya2Rvd24nOiB1bmRlZmluZWRcbiAgfT4gPSBuZXcgRW1pdHRlcigpXG4gIHByb3RlY3RlZCBkaXNwb3NhYmxlcyA9IG5ldyBDb21wb3NpdGVEaXNwb3NhYmxlKClcbiAgcHJvdGVjdGVkIGRlc3Ryb3llZCA9IGZhbHNlXG5cbiAgcHJpdmF0ZSBsb2FkaW5nOiBib29sZWFuID0gdHJ1ZVxuICBwcml2YXRlIHpvb21MZXZlbCA9IDBcbiAgcHJpdmF0ZSByZXBseUNhbGxiYWNrcyA9IG5ldyBNYXA8XG4gICAgbnVtYmVyLFxuICAgIHtcbiAgICAgIFtLIGluIGtleW9mIFJlcXVlc3RSZXBseU1hcF06IHtcbiAgICAgICAgcmVxdWVzdDogS1xuICAgICAgICBjYWxsYmFjazogKHJlcGx5OiBSZXF1ZXN0UmVwbHlNYXBbS10pID0+IHZvaWRcbiAgICAgIH1cbiAgICB9W2tleW9mIFJlcXVlc3RSZXBseU1hcF1cbiAgPigpXG4gIHByaXZhdGUgcmVwbHlDYWxsYmFja0lkID0gMFxuXG4gIHByb3RlY3RlZCBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGRlZmF1bHRSZW5kZXJNb2RlOiBFeGNsdWRlPHJlbmRlcmVyLlJlbmRlck1vZGUsICdzYXZlJz4gPSAnbm9ybWFsJyxcbiAgICBwcml2YXRlIHJlbmRlckxhVGVYOiBib29sZWFuID0gYXRvbUNvbmZpZygpLm1hdGhDb25maWdcbiAgICAgIC5lbmFibGVMYXRleFJlbmRlcmluZ0J5RGVmYXVsdCxcbiAgKSB7XG4gICAgdGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnd2VidmlldycpIGFzIGFueVxuICAgIHRoaXMuZWxlbWVudC5nZXRNb2RlbCA9ICgpID0+IHRoaXNcbiAgICB0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbWFya2Rvd24tcHJldmlldy1wbHVzJywgJ25hdGl2ZS1rZXktYmluZGluZ3MnKVxuICAgIHRoaXMuZWxlbWVudC5kaXNhYmxld2Vic2VjdXJpdHkgPSAndHJ1ZSdcbiAgICB0aGlzLmVsZW1lbnQubm9kZWludGVncmF0aW9uID0gJ3RydWUnXG4gICAgdGhpcy5lbGVtZW50LnNyYyA9IGBmaWxlOi8vLyR7X19kaXJuYW1lfS8uLi8uLi9jbGllbnQvdGVtcGxhdGUuaHRtbGBcbiAgICB0aGlzLmVsZW1lbnQuc3R5bGUud2lkdGggPSAnMTAwJSdcbiAgICB0aGlzLmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBhdG9tLnN0eWxlcy5vbkRpZEFkZFN0eWxlRWxlbWVudCgoKSA9PiB7XG4gICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKClcbiAgICAgIH0pLFxuICAgICAgYXRvbS5zdHlsZXMub25EaWRSZW1vdmVTdHlsZUVsZW1lbnQoKCkgPT4ge1xuICAgICAgICB0aGlzLnVwZGF0ZVN0eWxlcygpXG4gICAgICB9KSxcbiAgICAgIGF0b20uc3R5bGVzLm9uRGlkVXBkYXRlU3R5bGVFbGVtZW50KCgpID0+IHtcbiAgICAgICAgdGhpcy51cGRhdGVTdHlsZXMoKVxuICAgICAgfSksXG4gICAgKVxuICAgIHRoaXMuaGFuZGxlRXZlbnRzKClcbiAgICB0aGlzLmVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAgICdpcGMtbWVzc2FnZScsXG4gICAgICAoZTogRWxlY3Ryb24uSXBjTWVzc2FnZUV2ZW50Q3VzdG9tKSA9PiB7XG4gICAgICAgIHN3aXRjaCAoZS5jaGFubmVsKSB7XG4gICAgICAgICAgY2FzZSAnem9vbS1pbic6XG4gICAgICAgICAgICBhdG9tLmNvbW1hbmRzLmRpc3BhdGNoKFxuICAgICAgICAgICAgICB0aGlzLmVsZW1lbnQsXG4gICAgICAgICAgICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXM6em9vbS1pbicsXG4gICAgICAgICAgICApXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ3pvb20tb3V0JzpcbiAgICAgICAgICAgIGF0b20uY29tbWFuZHMuZGlzcGF0Y2goXG4gICAgICAgICAgICAgIHRoaXMuZWxlbWVudCxcbiAgICAgICAgICAgICAgJ21hcmtkb3duLXByZXZpZXctcGx1czp6b29tLW91dCcsXG4gICAgICAgICAgICApXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ29wZW4tc291cmNlJzpcbiAgICAgICAgICAgIHRoaXMub3BlblNvdXJjZShlLmFyZ3NbMF0uaW5pdGlhbExpbmUpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ2RpZC1zY3JvbGwtcHJldmlldyc6XG4gICAgICAgICAgICBjb25zdCB7IG1pbiwgbWF4IH0gPSBlLmFyZ3NbMF1cbiAgICAgICAgICAgIHRoaXMuZGlkU2Nyb2xsUHJldmlldyhtaW4sIG1heClcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgY2FzZSAncmVsb2FkJzpcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudC5yZWxvYWQoKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAvLyByZXBsaWVzXG4gICAgICAgICAgY2FzZSAncmVxdWVzdC1yZXBseSc6IHtcbiAgICAgICAgICAgIGNvbnN0IHsgaWQsIHJlcXVlc3QsIHJlc3VsdCB9ID0gZS5hcmdzWzBdXG4gICAgICAgICAgICBjb25zdCBjYiA9IHRoaXMucmVwbHlDYWxsYmFja3MuZ2V0KGlkKVxuICAgICAgICAgICAgaWYgKGNiICYmIHJlcXVlc3QgPT09IGNiLnJlcXVlc3QpIHtcbiAgICAgICAgICAgICAgY29uc3QgY2FsbGJhY2s6IChyOiBhbnkpID0+IHZvaWQgPSBjYi5jYWxsYmFja1xuICAgICAgICAgICAgICBjYWxsYmFjayhyZXN1bHQpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICApXG4gICAgdGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3dpbGwtbmF2aWdhdGUnLCBhc3luYyAoZSkgPT4ge1xuICAgICAgY29uc3QgeyBzaGVsbCB9ID0gYXdhaXQgaW1wb3J0KCdlbGVjdHJvbicpXG4gICAgICBjb25zdCBmaWxlVXJpVG9QYXRoID0gYXdhaXQgaW1wb3J0KCdmaWxlLXVyaS10by1wYXRoJylcbiAgICAgIGlmIChlLnVybC5zdGFydHNXaXRoKCdmaWxlOi8vJykpIHtcbiAgICAgICAgaGFuZGxlUHJvbWlzZShhdG9tLndvcmtzcGFjZS5vcGVuKGZpbGVVcmlUb1BhdGgoZS51cmwpKSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNoZWxsLm9wZW5FeHRlcm5hbChlLnVybClcbiAgICAgIH1cbiAgICB9KVxuICAgIHRoaXMucmVuZGVyUHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBjb25zdCBvbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLmRlc3Ryb3llZCkgcmV0dXJuXG4gICAgICAgIHRoaXMuZWxlbWVudC5zZXRab29tTGV2ZWwodGhpcy56b29tTGV2ZWwpXG4gICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKClcbiAgICAgICAgdGhpcy5lbGVtZW50LnNlbmQ8J3VzZS1naXRodWItc3R5bGUnPigndXNlLWdpdGh1Yi1zdHlsZScsIHtcbiAgICAgICAgICB2YWx1ZTogYXRvbS5jb25maWcuZ2V0KCdtYXJrZG93bi1wcmV2aWV3LXBsdXMudXNlR2l0SHViU3R5bGUnKSxcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy5lbGVtZW50LnNlbmQ8J3NldC1hdG9tLWhvbWUnPignc2V0LWF0b20taG9tZScsIHtcbiAgICAgICAgICBob21lOiBhdG9tLmdldENvbmZpZ0RpclBhdGgoKSxcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy5lbGVtZW50LnNlbmQ8J3NldC1udW1iZXItZXFucyc+KCdzZXQtbnVtYmVyLWVxbnMnLCB7XG4gICAgICAgICAgbnVtYmVyRXFuczogYXRvbUNvbmZpZygpLm1hdGhDb25maWcubnVtYmVyRXF1YXRpb25zLFxuICAgICAgICB9KVxuICAgICAgICB0aGlzLmVsZW1lbnQuc2VuZDwnc2V0LWJhc2UtcGF0aCc+KCdzZXQtYmFzZS1wYXRoJywge1xuICAgICAgICAgIHBhdGg6IHRoaXMuZ2V0UGF0aCgpLFxuICAgICAgICB9KVxuICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdCgnZGlkLWNoYW5nZS10aXRsZScpXG4gICAgICAgIHJlc29sdmUodGhpcy5yZW5kZXJNYXJrZG93bigpKVxuICAgICAgfVxuICAgICAgdGhpcy5lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2RvbS1yZWFkeScsIG9ubG9hZClcbiAgICB9KVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHJ1bkpTPFQ+KGpzOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUpID0+XG4gICAgICB0aGlzLmVsZW1lbnQuZXhlY3V0ZUphdmFTY3JpcHQoanMsIGZhbHNlLCByZXNvbHZlKSxcbiAgICApXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0SFRNTFNWRygpIHtcbiAgICByZXR1cm4gdGhpcy5ydW5SZXF1ZXN0KCdnZXQtaHRtbC1zdmcnKVxuICB9XG5cbiAgcHVibGljIGFic3RyYWN0IHNlcmlhbGl6ZSgpOiBTZXJpYWxpemVkTVBWXG5cbiAgcHVibGljIGRlc3Ryb3koKSB7XG4gICAgaWYgKHRoaXMuZGVzdHJveWVkKSByZXR1cm5cbiAgICB0aGlzLmRlc3Ryb3llZCA9IHRydWVcbiAgICBjb25zdCBwYXRoID0gdGhpcy5nZXRQYXRoKClcbiAgICBwYXRoICYmIGltYWdlV2F0Y2hlci5yZW1vdmVGaWxlKHBhdGgpXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgICB0aGlzLmVsZW1lbnQucmVtb3ZlKClcbiAgfVxuXG4gIHB1YmxpYyBvbkRpZENoYW5nZVRpdGxlKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogRGlzcG9zYWJsZSB7XG4gICAgcmV0dXJuIHRoaXMuZW1pdHRlci5vbignZGlkLWNoYW5nZS10aXRsZScsIGNhbGxiYWNrKVxuICB9XG5cbiAgcHVibGljIG9uRGlkQ2hhbmdlTWFya2Rvd24oY2FsbGJhY2s6ICgpID0+IHZvaWQpOiBEaXNwb3NhYmxlIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0dGVyLm9uKCdkaWQtY2hhbmdlLW1hcmtkb3duJywgY2FsbGJhY2spXG4gIH1cblxuICBwdWJsaWMgdG9nZ2xlUmVuZGVyTGF0ZXgoKSB7XG4gICAgdGhpcy5yZW5kZXJMYVRlWCA9ICF0aGlzLnJlbmRlckxhVGVYXG4gICAgdGhpcy5jaGFuZ2VIYW5kbGVyKClcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyByZWZyZXNoSW1hZ2VzKG9sZHNyYzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgdiA9IGF3YWl0IGltYWdlV2F0Y2hlci5nZXRWZXJzaW9uKG9sZHNyYywgdGhpcy5nZXRQYXRoKCkpXG4gICAgdGhpcy5lbGVtZW50LnNlbmQ8J3VwZGF0ZS1pbWFnZXMnPigndXBkYXRlLWltYWdlcycsIHsgb2xkc3JjLCB2IH0pXG4gIH1cblxuICBwdWJsaWMgYWJzdHJhY3QgZ2V0VGl0bGUoKTogc3RyaW5nXG5cbiAgcHVibGljIGdldERlZmF1bHRMb2NhdGlvbigpOiAnbGVmdCcgfCAncmlnaHQnIHwgJ2JvdHRvbScgfCAnY2VudGVyJyB7XG4gICAgcmV0dXJuIGF0b21Db25maWcoKS5wcmV2aWV3Q29uZmlnLnByZXZpZXdEb2NrXG4gIH1cblxuICBwdWJsaWMgZ2V0SWNvbk5hbWUoKSB7XG4gICAgcmV0dXJuICdtYXJrZG93bidcbiAgfVxuXG4gIHB1YmxpYyBhYnN0cmFjdCBnZXRVUkkoKTogc3RyaW5nXG5cbiAgcHVibGljIGFic3RyYWN0IGdldFBhdGgoKTogc3RyaW5nIHwgdW5kZWZpbmVkXG5cbiAgcHVibGljIGdldFNhdmVEaWFsb2dPcHRpb25zKCkge1xuICAgIGxldCBkZWZhdWx0UGF0aCA9IHRoaXMuZ2V0UGF0aCgpXG4gICAgaWYgKGRlZmF1bHRQYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHByb2plY3RQYXRoID0gYXRvbS5wcm9qZWN0LmdldFBhdGhzKClbMF1cbiAgICAgIGRlZmF1bHRQYXRoID0gJ3VudGl0bGVkLm1kJ1xuICAgICAgaWYgKHByb2plY3RQYXRoKSB7XG4gICAgICAgIGRlZmF1bHRQYXRoID0gcGF0aC5qb2luKHByb2plY3RQYXRoLCBkZWZhdWx0UGF0aClcbiAgICAgIH1cbiAgICB9XG4gICAgZGVmYXVsdFBhdGggKz0gJy4nICsgYXRvbUNvbmZpZygpLnNhdmVDb25maWcuZGVmYXVsdFNhdmVGb3JtYXRcbiAgICByZXR1cm4geyBkZWZhdWx0UGF0aCB9XG4gIH1cblxuICBwdWJsaWMgc2F2ZUFzKGZpbGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcbiAgICBpZiAoZmlsZVBhdGggPT09IHVuZGVmaW5lZCkgcmV0dXJuXG4gICAgaWYgKHRoaXMubG9hZGluZykgdGhyb3cgbmV3IEVycm9yKCdQcmV2aWV3IGlzIHN0aWxsIGxvYWRpbmcnKVxuXG4gICAgY29uc3QgeyBuYW1lLCBleHQgfSA9IHBhdGgucGFyc2UoZmlsZVBhdGgpXG5cbiAgICBpZiAoZXh0ID09PSAnLnBkZicpIHtcbiAgICAgIHRoaXMuZWxlbWVudC5wcmludFRvUERGKHt9LCAoZXJyb3IsIGRhdGEpID0+IHtcbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKCdGYWlsZWQgc2F2aW5nIHRvIFBERicsIHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBlcnJvci50b1N0cmluZygpLFxuICAgICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgICAgICBzdGFjazogZXJyb3Iuc3RhY2ssXG4gICAgICAgICAgfSlcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBkYXRhKVxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgaGFuZGxlUHJvbWlzZShcbiAgICAgICAgdGhpcy5nZXRIVE1MVG9TYXZlKGZpbGVQYXRoKS50aGVuKGFzeW5jIChodG1sKSA9PiB7XG4gICAgICAgICAgY29uc3QgZnVsbEh0bWwgPSB1dGlsLm1rSHRtbChcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICBodG1sLFxuICAgICAgICAgICAgdGhpcy5yZW5kZXJMYVRlWCxcbiAgICAgICAgICAgIGF0b20uY29uZmlnLmdldCgnbWFya2Rvd24tcHJldmlldy1wbHVzLnVzZUdpdEh1YlN0eWxlJyksXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnJ1blJlcXVlc3QoJ2dldC10ZXgtY29uZmlnJyksXG4gICAgICAgICAgKVxuXG4gICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgZnVsbEh0bWwpXG4gICAgICAgICAgcmV0dXJuIGF0b20ud29ya3NwYWNlLm9wZW4oZmlsZVBhdGgpXG4gICAgICAgIH0pLFxuICAgICAgKVxuICAgIH1cbiAgfVxuXG4gIHByb3RlY3RlZCBkaWRTY3JvbGxQcmV2aWV3KF9taW46IG51bWJlciwgX21heDogbnVtYmVyKSB7XG4gICAgLyogbm9vcCwgaW1wbGVtZW50YXRpb24gaW4gZWRpdG9yIHByZXZpZXcgKi9cbiAgfVxuXG4gIHByb3RlY3RlZCBjaGFuZ2VIYW5kbGVyID0gKCkgPT4ge1xuICAgIGhhbmRsZVByb21pc2UodGhpcy5yZW5kZXJNYXJrZG93bigpKVxuXG4gICAgY29uc3QgcGFuZSA9IGF0b20ud29ya3NwYWNlLnBhbmVGb3JJdGVtKHRoaXMpXG4gICAgaWYgKHBhbmUgIT09IHVuZGVmaW5lZCAmJiBwYW5lICE9PSBhdG9tLndvcmtzcGFjZS5nZXRBY3RpdmVQYW5lKCkpIHtcbiAgICAgIHBhbmUuYWN0aXZhdGVJdGVtKHRoaXMpXG4gICAgfVxuICB9XG5cbiAgcHJvdGVjdGVkIGFic3RyYWN0IGFzeW5jIGdldE1hcmtkb3duU291cmNlKCk6IFByb21pc2U8c3RyaW5nPlxuXG4gIHByb3RlY3RlZCBhYnN0cmFjdCBnZXRHcmFtbWFyKCk6IEdyYW1tYXIgfCB1bmRlZmluZWRcblxuICBwcm90ZWN0ZWQgb3BlblNvdXJjZShpbml0aWFsTGluZT86IG51bWJlcikge1xuICAgIGNvbnN0IHBhdGggPSB0aGlzLmdldFBhdGgoKVxuICAgIGlmIChwYXRoID09PSB1bmRlZmluZWQpIHJldHVyblxuICAgIGhhbmRsZVByb21pc2UoXG4gICAgICBhdG9tLndvcmtzcGFjZS5vcGVuKHBhdGgsIHtcbiAgICAgICAgaW5pdGlhbExpbmUsXG4gICAgICAgIHNlYXJjaEFsbFBhbmVzOiB0cnVlLFxuICAgICAgfSksXG4gICAgKVxuICB9XG5cbiAgLy9cbiAgLy8gU2Nyb2xsIHRoZSBhc3NvY2lhdGVkIHByZXZpZXcgdG8gdGhlIGVsZW1lbnQgcmVwcmVzZW50aW5nIHRoZSB0YXJnZXQgbGluZSBvZlxuICAvLyBvZiB0aGUgc291cmNlIG1hcmtkb3duLlxuICAvL1xuICAvLyBAcGFyYW0ge3N0cmluZ30gdGV4dCBTb3VyY2UgbWFya2Rvd24gb2YgdGhlIGFzc29jaWF0ZWQgZWRpdG9yLlxuICAvLyBAcGFyYW0ge251bWJlcn0gbGluZSBUYXJnZXQgbGluZSBvZiBgdGV4dGAuIFRoZSBtZXRob2Qgd2lsbCBhdHRlbXB0IHRvXG4gIC8vICAgaWRlbnRpZnkgdGhlIGVsbWVudCBvZiB0aGUgYXNzb2NpYXRlZCBgbWFya2Rvd24tcHJldmlldy1wbHVzLXZpZXdgIHRoYXQgcmVwcmVzZW50c1xuICAvLyAgIGBsaW5lYCBhbmQgc2Nyb2xsIHRoZSBgbWFya2Rvd24tcHJldmlldy1wbHVzLXZpZXdgIHRvIHRoYXQgZWxlbWVudC5cbiAgLy8gQHJldHVybiB7bnVtYmVyfG51bGx9IFRoZSBlbGVtZW50IHRoYXQgcmVwcmVzZW50cyBgbGluZWAuIElmIG5vIGVsZW1lbnQgaXNcbiAgLy8gICBpZGVudGlmaWVkIGBudWxsYCBpcyByZXR1cm5lZC5cbiAgLy9cbiAgcHJvdGVjdGVkIHN5bmNQcmV2aWV3KGxpbmU6IG51bWJlcikge1xuICAgIHRoaXMuZWxlbWVudC5zZW5kPCdzeW5jJz4oJ3N5bmMnLCB7IGxpbmUgfSlcbiAgfVxuXG48PDw8PDw8IEhFQURcbiAgcHJvdGVjdGVkIG9wZW5OZXdXaW5kb3coKSB7XG4gICAgY29uc3QgcGF0aCA9IHRoaXMuZ2V0UGF0aCgpXG4gICAgaWYgKCFwYXRoKSB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyhcbiAgICAgICAgJ0NhbiBub3Qgb3BlbiB0aGlzIHByZXZpZXcgaW4gbmV3IHdpbmRvdzogbm8gZmlsZSBwYXRoJyxcbiAgICAgIClcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBhdG9tLm9wZW4oe1xuICAgICAgcGF0aHNUb09wZW46IFtgbWFya2Rvd24tcHJldmlldy1wbHVzOi8vZmlsZS8ke3BhdGh9YF0sXG4gICAgICBuZXdXaW5kb3c6IHRydWUsXG4gICAgfSlcbiAgICB1dGlsLmRlc3Ryb3kodGhpcylcbj09PT09PT1cbiAgcHJpdmF0ZSBhc3luYyBydW5SZXF1ZXN0PFQgZXh0ZW5kcyBrZXlvZiBSZXF1ZXN0UmVwbHlNYXA+KHJlcXVlc3Q6IFQpIHtcbiAgICBjb25zdCBpZCA9IHRoaXMucmVwbHlDYWxsYmFja0lkKytcbiAgICByZXR1cm4gbmV3IFByb21pc2U8UmVxdWVzdFJlcGx5TWFwW1RdPigocmVzb2x2ZSkgPT4ge1xuICAgICAgdGhpcy5yZXBseUNhbGxiYWNrcy5zZXQoaWQsIHtcbiAgICAgICAgcmVxdWVzdDogcmVxdWVzdCBhcyBhbnksXG4gICAgICAgIGNhbGxiYWNrOiAocmVzdWx0OiBSZXF1ZXN0UmVwbHlNYXBbVF0pID0+IHtcbiAgICAgICAgICB0aGlzLnJlcGx5Q2FsbGJhY2tzLmRlbGV0ZShpZClcbiAgICAgICAgICByZXNvbHZlKHJlc3VsdClcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgICB0aGlzLmVsZW1lbnQuc2VuZDxUPihyZXF1ZXN0LCB7IGlkIH0pXG4gICAgfSlcbj4+Pj4+Pj4gbWFzdGVyXG4gIH1cblxuICBwcml2YXRlIGhhbmRsZUV2ZW50cygpIHtcbiAgICB0aGlzLmRpc3Bvc2FibGVzLmFkZChcbiAgICAgIGF0b20uZ3JhbW1hcnMub25EaWRBZGRHcmFtbWFyKCgpID0+XG4gICAgICAgIF8uZGVib3VuY2UoKCkgPT4ge1xuICAgICAgICAgIGhhbmRsZVByb21pc2UodGhpcy5yZW5kZXJNYXJrZG93bigpKVxuICAgICAgICB9LCAyNTApLFxuICAgICAgKSxcbiAgICAgIGF0b20uZ3JhbW1hcnMub25EaWRVcGRhdGVHcmFtbWFyKFxuICAgICAgICBfLmRlYm91bmNlKCgpID0+IHtcbiAgICAgICAgICBoYW5kbGVQcm9taXNlKHRoaXMucmVuZGVyTWFya2Rvd24oKSlcbiAgICAgICAgfSwgMjUwKSxcbiAgICAgICksXG4gICAgKVxuXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBhdG9tLmNvbW1hbmRzLmFkZCh0aGlzLmVsZW1lbnQsIHtcbiAgICAgICAgJ2NvcmU6bW92ZS11cCc6ICgpID0+IHRoaXMuZWxlbWVudC5zY3JvbGxCeSh7IHRvcDogLTEwIH0pLFxuICAgICAgICAnY29yZTptb3ZlLWRvd24nOiAoKSA9PiB0aGlzLmVsZW1lbnQuc2Nyb2xsQnkoeyB0b3A6IDEwIH0pLFxuICAgICAgICAnY29yZTpjb3B5JzogKGV2ZW50OiBDb21tYW5kRXZlbnQpID0+IHtcbiAgICAgICAgICBpZiAodGhpcy5jb3B5VG9DbGlwYm9hcmQoKSkgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgfSxcbiAgICAgICAgJ21hcmtkb3duLXByZXZpZXctcGx1czpvcGVuLWRldi10b29scyc6ICgpID0+IHtcbiAgICAgICAgICB0aGlzLmVsZW1lbnQub3BlbkRldlRvb2xzKClcbiAgICAgICAgfSxcbiAgICAgICAgJ21hcmtkb3duLXByZXZpZXctcGx1czpuZXctd2luZG93JzogKCkgPT4ge1xuICAgICAgICAgIHRoaXMub3Blbk5ld1dpbmRvdygpXG4gICAgICAgIH0sXG4gICAgICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXM6cHJpbnQnOiAoKSA9PiB7XG4gICAgICAgICAgdGhpcy5lbGVtZW50LnByaW50KClcbiAgICAgICAgfSxcbiAgICAgICAgJ21hcmtkb3duLXByZXZpZXctcGx1czp6b29tLWluJzogKCkgPT4ge1xuICAgICAgICAgIHRoaXMuem9vbUxldmVsICs9IDAuMVxuICAgICAgICAgIHRoaXMuZWxlbWVudC5zZXRab29tTGV2ZWwodGhpcy56b29tTGV2ZWwpXG4gICAgICAgIH0sXG4gICAgICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXM6em9vbS1vdXQnOiAoKSA9PiB7XG4gICAgICAgICAgdGhpcy56b29tTGV2ZWwgLT0gMC4xXG4gICAgICAgICAgdGhpcy5lbGVtZW50LnNldFpvb21MZXZlbCh0aGlzLnpvb21MZXZlbClcbiAgICAgICAgfSxcbiAgICAgICAgJ21hcmtkb3duLXByZXZpZXctcGx1czpyZXNldC16b29tJzogKCkgPT4ge1xuICAgICAgICAgIHRoaXMuem9vbUxldmVsID0gMFxuICAgICAgICAgIHRoaXMuZWxlbWVudC5zZXRab29tTGV2ZWwodGhpcy56b29tTGV2ZWwpXG4gICAgICAgIH0sXG4gICAgICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXM6c3luYy1zb3VyY2UnOiBhc3luYyAoX2V2ZW50KSA9PiB7XG4gICAgICAgICAgdGhpcy5lbGVtZW50LnNlbmQ8J3N5bmMtc291cmNlJz4oJ3N5bmMtc291cmNlJywgdW5kZWZpbmVkKVxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKVxuXG4gICAgdGhpcy5kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBhdG9tLmNvbmZpZy5vbkRpZENoYW5nZSgnbWFya2Rvd24tcHJldmlldy1wbHVzLm1hcmtkb3duSXRDb25maWcnLCAoKSA9PiB7XG4gICAgICAgIGlmIChhdG9tQ29uZmlnKCkucmVuZGVyZXIgPT09ICdtYXJrZG93bi1pdCcpIHRoaXMuY2hhbmdlSGFuZGxlcigpXG4gICAgICB9KSxcbiAgICAgIGF0b20uY29uZmlnLm9uRGlkQ2hhbmdlKCdtYXJrZG93bi1wcmV2aWV3LXBsdXMucGFuZG9jQ29uZmlnJywgKCkgPT4ge1xuICAgICAgICBpZiAoYXRvbUNvbmZpZygpLnJlbmRlcmVyID09PSAncGFuZG9jJykgdGhpcy5jaGFuZ2VIYW5kbGVyKClcbiAgICAgIH0pLFxuICAgICAgYXRvbS5jb25maWcub25EaWRDaGFuZ2UoXG4gICAgICAgICdtYXJrZG93bi1wcmV2aWV3LXBsdXMubWF0aENvbmZpZy5sYXRleFJlbmRlcmVyJyxcbiAgICAgICAgdGhpcy5jaGFuZ2VIYW5kbGVyLFxuICAgICAgKSxcbiAgICAgIGF0b20uY29uZmlnLm9uRGlkQ2hhbmdlKFxuICAgICAgICAnbWFya2Rvd24tcHJldmlldy1wbHVzLm1hdGhDb25maWcubnVtYmVyRXF1YXRpb25zJyxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHRoaXMuZWxlbWVudC5zZW5kPCdyZWxvYWQnPigncmVsb2FkJywgdW5kZWZpbmVkKVxuICAgICAgICB9LFxuICAgICAgKSxcbiAgICAgIGF0b20uY29uZmlnLm9uRGlkQ2hhbmdlKFxuICAgICAgICAnbWFya2Rvd24tcHJldmlldy1wbHVzLnJlbmRlcmVyJyxcbiAgICAgICAgdGhpcy5jaGFuZ2VIYW5kbGVyLFxuICAgICAgKSxcbiAgICAgIGF0b20uY29uZmlnLm9uRGlkQ2hhbmdlKFxuICAgICAgICAnbWFya2Rvd24tcHJldmlldy1wbHVzLnVzZUdpdEh1YlN0eWxlJyxcbiAgICAgICAgKHsgbmV3VmFsdWUgfSkgPT4ge1xuICAgICAgICAgIHRoaXMuZWxlbWVudC5zZW5kPCd1c2UtZ2l0aHViLXN0eWxlJz4oJ3VzZS1naXRodWItc3R5bGUnLCB7XG4gICAgICAgICAgICB2YWx1ZTogbmV3VmFsdWUsXG4gICAgICAgICAgfSlcbiAgICAgICAgfSxcbiAgICAgICksXG4gICAgKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZW5kZXJNYXJrZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzb3VyY2UgPSBhd2FpdCB0aGlzLmdldE1hcmtkb3duU291cmNlKClcbiAgICBhd2FpdCB0aGlzLnJlbmRlck1hcmtkb3duVGV4dChzb3VyY2UpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldEhUTUxUb1NhdmUoc2F2ZVBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IHNvdXJjZSA9IGF3YWl0IHRoaXMuZ2V0TWFya2Rvd25Tb3VyY2UoKVxuICAgIHJldHVybiByZW5kZXJlci5yZW5kZXIoXG4gICAgICBzb3VyY2UsXG4gICAgICB0aGlzLmdldFBhdGgoKSxcbiAgICAgIHRoaXMuZ2V0R3JhbW1hcigpLFxuICAgICAgdGhpcy5yZW5kZXJMYVRlWCxcbiAgICAgICdzYXZlJyxcbiAgICAgIHNhdmVQYXRoLFxuICAgIClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVuZGVyTWFya2Rvd25UZXh0KHRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBkb21Eb2N1bWVudCA9IGF3YWl0IHJlbmRlcmVyLnJlbmRlcihcbiAgICAgICAgdGV4dCxcbiAgICAgICAgdGhpcy5nZXRQYXRoKCksXG4gICAgICAgIHRoaXMuZ2V0R3JhbW1hcigpLFxuICAgICAgICB0aGlzLnJlbmRlckxhVGVYLFxuICAgICAgICB0aGlzLmRlZmF1bHRSZW5kZXJNb2RlLFxuICAgICAgKVxuICAgICAgaWYgKHRoaXMuZGVzdHJveWVkKSByZXR1cm5cbiAgICAgIHRoaXMubG9hZGluZyA9IGZhbHNlXG4gICAgICB0aGlzLmVsZW1lbnQuc2VuZDwndXBkYXRlLXByZXZpZXcnPigndXBkYXRlLXByZXZpZXcnLCB7XG4gICAgICAgIGh0bWw6IGRvbURvY3VtZW50LmRvY3VtZW50RWxlbWVudC5vdXRlckhUTUwsXG4gICAgICAgIHJlbmRlckxhVGVYOiB0aGlzLnJlbmRlckxhVGVYLFxuICAgICAgICBtanJlbmRlcmVyOiBhdG9tQ29uZmlnKCkubWF0aENvbmZpZy5sYXRleFJlbmRlcmVyLFxuICAgICAgfSlcbiAgICAgIHRoaXMuZWxlbWVudC5zZW5kPCdzZXQtc291cmNlLW1hcCc+KCdzZXQtc291cmNlLW1hcCcsIHtcbiAgICAgICAgbWFwOiB1dGlsLmJ1aWxkTGluZU1hcChtYXJrZG93bkl0LmdldFRva2Vucyh0ZXh0LCB0aGlzLnJlbmRlckxhVGVYKSksXG4gICAgICB9KVxuICAgICAgdGhpcy5lbWl0dGVyLmVtaXQoJ2RpZC1jaGFuZ2UtbWFya2Rvd24nKVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aGlzLnNob3dFcnJvcihlcnJvciBhcyBFcnJvcilcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNob3dFcnJvcihlcnJvcjogRXJyb3IpIHtcbiAgICBpZiAodGhpcy5kZXN0cm95ZWQpIHtcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRGYXRhbEVycm9yKFxuICAgICAgICAnRXJyb3IgcmVwb3J0ZWQgb24gYSBkZXN0cm95ZWQgTWFya2Rvd24gUHJldmlldyBQbHVzIHZpZXcnLFxuICAgICAgICB7XG4gICAgICAgICAgZGlzbWlzc2FibGU6IHRydWUsXG4gICAgICAgICAgc3RhY2s6IGVycm9yLnN0YWNrLFxuICAgICAgICAgIGRldGFpbDogZXJyb3IubWVzc2FnZSxcbiAgICAgICAgfSxcbiAgICAgIClcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB0aGlzLmVsZW1lbnQuc2VuZDwnZXJyb3InPignZXJyb3InLCB7IG1zZzogZXJyb3IubWVzc2FnZSB9KVxuICB9XG5cbiAgcHJpdmF0ZSBjb3B5VG9DbGlwYm9hcmQoKSB7XG4gICAgaWYgKHRoaXMubG9hZGluZykge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gd2luZG93LmdldFNlbGVjdGlvbigpXG4gICAgY29uc3Qgc2VsZWN0ZWRUZXh0ID0gc2VsZWN0aW9uLnRvU3RyaW5nKClcbiAgICBjb25zdCBzZWxlY3RlZE5vZGUgPSBzZWxlY3Rpb24uYmFzZU5vZGUgYXMgSFRNTEVsZW1lbnRcblxuICAgIC8vIFVzZSBkZWZhdWx0IGNvcHkgZXZlbnQgaGFuZGxlciBpZiB0aGVyZSBpcyBzZWxlY3RlZCB0ZXh0IGluc2lkZSB0aGlzIHZpZXdcbiAgICBpZiAoXG4gICAgICBzZWxlY3RlZFRleHQgJiZcbiAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTpzdHJpY3QtdHlwZS1wcmVkaWNhdGVzIC8vVE9ETzogY29tcGxhaW4gb24gVFNcbiAgICAgIHNlbGVjdGVkTm9kZSAhPSBudWxsIC8vICYmXG4gICAgICAvLyAodGhpcy5wcmV2aWV3ID09PSBzZWxlY3RlZE5vZGUgfHwgdGhpcy5wcmV2aWV3LmNvbnRhaW5zKHNlbGVjdGVkTm9kZSkpXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICBoYW5kbGVQcm9taXNlKFxuICAgICAgdGhpcy5nZXRNYXJrZG93blNvdXJjZSgpLnRoZW4oYXN5bmMgKHNyYykgPT5cbiAgICAgICAgY29weUh0bWwoc3JjLCB0aGlzLmdldFBhdGgoKSwgdGhpcy5yZW5kZXJMYVRlWCksXG4gICAgICApLFxuICAgIClcblxuICAgIHJldHVybiB0cnVlXG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZVN0eWxlcygpIHtcbiAgICBjb25zdCBzdHlsZXM6IHN0cmluZ1tdID0gW11cbiAgICBmb3IgKGNvbnN0IHNlIG9mIGF0b20uc3R5bGVzLmdldFN0eWxlRWxlbWVudHMoKSkge1xuICAgICAgc3R5bGVzLnB1c2goc2UuaW5uZXJIVE1MKVxuICAgIH1cbiAgICB0aGlzLmVsZW1lbnQuc2VuZDwnc3R5bGUnPignc3R5bGUnLCB7IHN0eWxlcyB9KVxuICB9XG59XG4iXX0=