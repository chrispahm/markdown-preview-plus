"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const CSON = require("season");
const fs = require("fs");
const util_1 = require("./util");
let isMathJaxDisabled = false;
async function mathProcessor(domElements, renderer) {
    if (isMathJaxDisabled)
        return;
    const jax = await loadMathJax(renderer);
    await jax.queueTypeset(domElements);
}
exports.mathProcessor = mathProcessor;
async function processHTMLString(element) {
    if (isMathJaxDisabled) {
        return element.innerHTML;
    }
    const jax = await loadMathJax('SVG');
    await jax.queueTypeset([element]);
    const msvgh = document.getElementById('MathJax_SVG_Hidden');
    const svgGlyphs = msvgh && msvgh.parentNode.cloneNode(true);
    if (svgGlyphs !== null) {
        element.insertBefore(svgGlyphs, element.firstChild);
    }
    return element.innerHTML;
}
exports.processHTMLString = processHTMLString;
function disableMathJax(disable) {
    isMathJaxDisabled = disable;
}
let mjPromise;
async function loadMathJax(renderer) {
    if (mjPromise)
        return mjPromise;
    mjPromise = attachMathJax(renderer);
    return mjPromise;
}
exports.testing = {
    loadMathJax,
    disableMathJax,
};
async function getUserMacrosPath() {
    const home = await window.atomHome;
    const userMacrosPath = CSON.resolve(path.join(home, 'markdown-preview-plus'));
    return userMacrosPath != null
        ? userMacrosPath
        : path.join(home, 'markdown-preview-plus.cson');
}
function loadMacrosFile(filePath) {
    if (!CSON.isObjectPath(filePath)) {
        return {};
    }
    return CSON.readFileSync(filePath, function (error, object) {
        if (object === undefined) {
            object = {};
        }
        if (error !== undefined) {
            console.warn(`Error reading Latex Macros file '${filePath}': ${error.stack !== undefined ? error.stack : error}`);
            console.error(`Failed to load Latex Macros from '${filePath}'`, {
                detail: error.message,
                dismissable: true,
            });
        }
        return object;
    });
}
async function loadUserMacros() {
    const userMacrosPath = await getUserMacrosPath();
    if (util_1.isFileSync(userMacrosPath)) {
        return loadMacrosFile(userMacrosPath);
    }
    else {
        console.debug('Creating markdown-preview-plus.cson, this is a one-time operation.');
        createMacrosTemplate(userMacrosPath);
        return loadMacrosFile(userMacrosPath);
    }
}
function createMacrosTemplate(filePath) {
    const templatePath = path.join(__dirname, '../assets/macros-template.cson');
    const templateFile = fs.readFileSync(templatePath, 'utf8');
    fs.writeFileSync(filePath, templateFile);
}
function checkMacros(macrosObject) {
    const namePattern = /^[^a-zA-Z\d\s]$|^[a-zA-Z]*$/;
    for (const name in macrosObject) {
        const value = macrosObject[name];
        if (!name.match(namePattern) || !valueMatchesPattern(value)) {
            delete macrosObject[name];
            console.error(`Failed to load LaTeX macro named '${name}'. Please see the [LaTeX guide](https://github.com/atom-community/markdown-preview-plus/blob/master/docs/math.md#macro-names)`);
        }
    }
    return macrosObject;
}
function valueMatchesPattern(value) {
    if (Array.isArray(value)) {
        const macroDefinition = value[0];
        const numberOfArgs = value[1];
        if (typeof numberOfArgs === 'number') {
            return numberOfArgs % 1 === 0 && typeof macroDefinition === 'string';
        }
        else {
            return false;
        }
    }
    else if (typeof value === 'string') {
        return true;
    }
    else {
        return false;
    }
}
async function configureMathJax(jax, renderer) {
    let userMacros = await loadUserMacros();
    if (userMacros) {
        userMacros = checkMacros(userMacros);
    }
    else {
        userMacros = {};
    }
    jax.jaxConfigure(userMacros, renderer);
    console.log('Loaded maths rendering engine MathJax');
}
async function attachMathJax(renderer) {
    console.log('Loading maths rendering engine MathJax');
    await Promise.all([
        injectScript(`${require.resolve('mathjax')}?delayStartupUntil=configured`),
    ]);
    const { mathJaxStub } = await Promise.resolve().then(() => require('./mathjax-stub'));
    await configureMathJax(mathJaxStub, renderer);
    return mathJaxStub;
}
async function injectScript(scriptSrc) {
    const script = document.createElement('script');
    script.src = scriptSrc;
    script.type = 'text/javascript';
    document.head.appendChild(script);
    return new Promise((resolve) => {
        script.addEventListener('load', () => resolve());
    });
}
exports.injectScript = injectScript;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0aGpheC1oZWxwZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMtY2xpZW50L21hdGhqYXgtaGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBT0EsNkJBQTZCO0FBQzdCLCtCQUErQjtBQUMvQix5QkFBeUI7QUFDekIsaUNBQW1DO0FBR25DLElBQUksaUJBQWlCLEdBQUcsS0FBSyxDQUFBO0FBU3RCLEtBQUssd0JBQ1YsV0FBbUIsRUFDbkIsUUFBeUI7SUFFekIsRUFBRSxDQUFDLENBQUMsaUJBQWlCLENBQUM7UUFBQyxNQUFNLENBQUE7SUFDN0IsTUFBTSxHQUFHLEdBQUcsTUFBTSxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUE7SUFDdkMsTUFBTSxHQUFHLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFBO0FBQ3JDLENBQUM7QUFQRCxzQ0FPQztBQVNNLEtBQUssNEJBQTRCLE9BQWdCO0lBQ3RELEVBQUUsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUN0QixNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQTtJQUMxQixDQUFDO0lBQ0QsTUFBTSxHQUFHLEdBQUcsTUFBTSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUE7SUFDcEMsTUFBTSxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQTtJQUVqQyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLG9CQUFvQixDQUFDLENBQUE7SUFDM0QsTUFBTSxTQUFTLEdBQUcsS0FBSyxJQUFJLEtBQUssQ0FBQyxVQUFXLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQzVELEVBQUUsQ0FBQyxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3ZCLE9BQU8sQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQTtJQUNyRCxDQUFDO0lBQ0QsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUE7QUFDMUIsQ0FBQztBQWJELDhDQWFDO0FBR0Qsd0JBQXdCLE9BQWdCO0lBQ3RDLGlCQUFpQixHQUFHLE9BQU8sQ0FBQTtBQUM3QixDQUFDO0FBUUQsSUFBSSxTQUErQixDQUFBO0FBQ25DLEtBQUssc0JBQXNCLFFBQXlCO0lBQ2xELEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUE7SUFDL0IsU0FBUyxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQTtJQUNuQyxNQUFNLENBQUMsU0FBUyxDQUFBO0FBQ2xCLENBQUM7QUFFWSxRQUFBLE9BQU8sR0FBRztJQUNyQixXQUFXO0lBQ1gsY0FBYztDQUNmLENBQUE7QUFJRCxLQUFLO0lBQ0gsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsUUFBUSxDQUFBO0lBQ2xDLE1BQU0sY0FBYyxHQUE4QixJQUFJLENBQUMsT0FBTyxDQUM1RCxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSx1QkFBdUIsQ0FBQyxDQUN6QyxDQUFBO0lBQ0QsTUFBTSxDQUFDLGNBQWMsSUFBSSxJQUFJO1FBQzNCLENBQUMsQ0FBQyxjQUFjO1FBQ2hCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSw0QkFBNEIsQ0FBQyxDQUFBO0FBQ25ELENBQUM7QUFFRCx3QkFBd0IsUUFBZ0I7SUFDdEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqQyxNQUFNLENBQUMsRUFBRSxDQUFBO0lBQ1gsQ0FBQztJQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxVQUFTLEtBQWEsRUFBRSxNQUFlO1FBQ3hFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLE1BQU0sR0FBRyxFQUFFLENBQUE7UUFDYixDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDeEIsT0FBTyxDQUFDLElBQUksQ0FDVixvQ0FBb0MsUUFBUSxNQUMxQyxLQUFLLENBQUMsS0FBSyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FDNUMsRUFBRSxDQUNILENBQUE7WUFDRCxPQUFPLENBQUMsS0FBSyxDQUFDLHFDQUFxQyxRQUFRLEdBQUcsRUFBRTtnQkFDOUQsTUFBTSxFQUFFLEtBQUssQ0FBQyxPQUFPO2dCQUNyQixXQUFXLEVBQUUsSUFBSTthQUNsQixDQUFDLENBQUE7UUFDSixDQUFDO1FBQ0QsTUFBTSxDQUFDLE1BQU0sQ0FBQTtJQUNmLENBQUMsQ0FBQyxDQUFBO0FBQ0osQ0FBQztBQUVELEtBQUs7SUFDSCxNQUFNLGNBQWMsR0FBRyxNQUFNLGlCQUFpQixFQUFFLENBQUE7SUFDaEQsRUFBRSxDQUFDLENBQUMsaUJBQVUsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0IsTUFBTSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsQ0FBQTtJQUN2QyxDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDTixPQUFPLENBQUMsS0FBSyxDQUNYLG9FQUFvRSxDQUNyRSxDQUFBO1FBQ0Qsb0JBQW9CLENBQUMsY0FBYyxDQUFDLENBQUE7UUFDcEMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsQ0FBQTtJQUN2QyxDQUFDO0FBQ0gsQ0FBQztBQUVELDhCQUE4QixRQUFnQjtJQUM1QyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFBO0lBQzNFLE1BQU0sWUFBWSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFBO0lBQzFELEVBQUUsQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQyxDQUFBO0FBQzFDLENBQUM7QUFFRCxxQkFBcUIsWUFBb0I7SUFDdkMsTUFBTSxXQUFXLEdBQUcsNkJBQTZCLENBQUE7SUFDakQsR0FBRyxDQUFDLENBQUMsTUFBTSxJQUFJLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQztRQUNoQyxNQUFNLEtBQUssR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDaEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVELE9BQU8sWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQ3pCLE9BQU8sQ0FBQyxLQUFLLENBQ1gscUNBQXFDLElBQUksK0hBQStILENBQ3pLLENBQUE7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUNELE1BQU0sQ0FBQyxZQUFZLENBQUE7QUFDckIsQ0FBQztBQUVELDZCQUE2QixLQUFVO0lBRXJDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pCLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUNoQyxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDN0IsRUFBRSxDQUFDLENBQUMsT0FBTyxZQUFZLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsWUFBWSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksT0FBTyxlQUFlLEtBQUssUUFBUSxDQUFBO1FBQ3RFLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxLQUFLLENBQUE7UUFDZCxDQUFDO0lBQ0gsQ0FBQztJQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUE7SUFDYixDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDTixNQUFNLENBQUMsS0FBSyxDQUFBO0lBQ2QsQ0FBQztBQUNILENBQUM7QUFLRCxLQUFLLDJCQUEyQixHQUFnQixFQUFFLFFBQXlCO0lBQ3pFLElBQUksVUFBVSxHQUFHLE1BQU0sY0FBYyxFQUFFLENBQUE7SUFDdkMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUNmLFVBQVUsR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUE7SUFDdEMsQ0FBQztJQUFDLElBQUksQ0FBQyxDQUFDO1FBQ04sVUFBVSxHQUFHLEVBQUUsQ0FBQTtJQUNqQixDQUFDO0lBRUQsR0FBRyxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUE7SUFHdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFBO0FBQ3RELENBQUM7QUFLRCxLQUFLLHdCQUF3QixRQUF5QjtJQUNwRCxPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUE7SUFHckQsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDO1FBQ2hCLFlBQVksQ0FBQyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLCtCQUErQixDQUFDO0tBQzNFLENBQUMsQ0FBQTtJQUNGLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRywyQ0FBYSxnQkFBZ0IsRUFBQyxDQUFBO0lBQ3RELE1BQU0sZ0JBQWdCLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxDQUFBO0lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUE7QUFDcEIsQ0FBQztBQUVNLEtBQUssdUJBQXVCLFNBQWlCO0lBQ2xELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUE7SUFDL0MsTUFBTSxDQUFDLEdBQUcsR0FBRyxTQUFTLENBQUE7SUFDdEIsTUFBTSxDQUFDLElBQUksR0FBRyxpQkFBaUIsQ0FBQTtJQUMvQixRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUNqQyxNQUFNLENBQUMsSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRTtRQUNuQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUE7SUFDbEQsQ0FBQyxDQUFDLENBQUE7QUFDSixDQUFDO0FBUkQsb0NBUUMiLCJzb3VyY2VzQ29udGVudCI6WyIvL1xuLy8gbWF0aGpheC1oZWxwZXJcbi8vXG4vLyBUaGlzIG1vZHVsZSB3aWxsIGhhbmRsZSBsb2FkaW5nIHRoZSBNYXRoSmF4IGVudmlyb25tZW50IGFuZCBwcm92aWRlIGEgd3JhcHBlclxuLy8gZm9yIGNhbGxzIHRvIE1hdGhKYXggdG8gcHJvY2VzcyBMYVRlWCBlcXVhdGlvbnMuXG4vL1xuXG5pbXBvcnQgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKVxuaW1wb3J0IENTT04gPSByZXF1aXJlKCdzZWFzb24nKVxuaW1wb3J0IGZzID0gcmVxdWlyZSgnZnMnKVxuaW1wb3J0IHsgaXNGaWxlU3luYyB9IGZyb20gJy4vdXRpbCdcbmltcG9ydCB7IE1hdGhKYXhTdHViIH0gZnJvbSAnLi9tYXRoamF4LXN0dWInXG5cbmxldCBpc01hdGhKYXhEaXNhYmxlZCA9IGZhbHNlXG5cbi8vXG4vLyBQcm9jZXNzIERPTSBlbGVtZW50cyBmb3IgTGFUZVggZXF1YXRpb25zIHdpdGggTWF0aEpheFxuLy9cbi8vIEBwYXJhbSBkb21FbGVtZW50cyBBbiBhcnJheSBvZiBET00gZWxlbWVudHMgdG8gYmUgcHJvY2Vzc2VkIGJ5IE1hdGhKYXguIFNlZVxuLy8gICBbZWxlbWVudF0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL2VsZW1lbnQpIGZvclxuLy8gICBkZXRhaWxzIG9uIERPTSBlbGVtZW50cy5cbi8vXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF0aFByb2Nlc3NvcihcbiAgZG9tRWxlbWVudHM6IE5vZGVbXSxcbiAgcmVuZGVyZXI6IE1hdGhKYXhSZW5kZXJlcixcbikge1xuICBpZiAoaXNNYXRoSmF4RGlzYWJsZWQpIHJldHVyblxuICBjb25zdCBqYXggPSBhd2FpdCBsb2FkTWF0aEpheChyZW5kZXJlcilcbiAgYXdhaXQgamF4LnF1ZXVlVHlwZXNldChkb21FbGVtZW50cylcbn1cblxuLy9cbi8vIFByb2Nlc3MgbWF0aHMgaW4gSFRNTCBmcmFnbWVudCB3aXRoIE1hdGhKYXhcbi8vXG4vLyBAcGFyYW0gaHRtbCBBIEhUTUwgZnJhZ21lbnQgc3RyaW5nXG4vLyBAcGFyYW0gY2FsbGJhY2sgQSBjYWxsYmFjayBtZXRob2QgdGhhdCBhY2NlcHRzIGEgc2luZ2xlIHBhcmFtZXRlciwgYSBIVE1MXG4vLyAgIGZyYWdtZW50IHN0cmluZyB0aGF0IGlzIHRoZSByZXN1bHQgb2YgaHRtbCBwcm9jZXNzZWQgYnkgTWF0aEpheFxuLy9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcm9jZXNzSFRNTFN0cmluZyhlbGVtZW50OiBFbGVtZW50KSB7XG4gIGlmIChpc01hdGhKYXhEaXNhYmxlZCkge1xuICAgIHJldHVybiBlbGVtZW50LmlubmVySFRNTFxuICB9XG4gIGNvbnN0IGpheCA9IGF3YWl0IGxvYWRNYXRoSmF4KCdTVkcnKVxuICBhd2FpdCBqYXgucXVldWVUeXBlc2V0KFtlbGVtZW50XSlcblxuICBjb25zdCBtc3ZnaCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdNYXRoSmF4X1NWR19IaWRkZW4nKVxuICBjb25zdCBzdmdHbHlwaHMgPSBtc3ZnaCAmJiBtc3ZnaC5wYXJlbnROb2RlIS5jbG9uZU5vZGUodHJ1ZSlcbiAgaWYgKHN2Z0dseXBocyAhPT0gbnVsbCkge1xuICAgIGVsZW1lbnQuaW5zZXJ0QmVmb3JlKHN2Z0dseXBocywgZWxlbWVudC5maXJzdENoaWxkKVxuICB9XG4gIHJldHVybiBlbGVtZW50LmlubmVySFRNTFxufVxuXG4vLyBGb3IgdGVzdGluZ1xuZnVuY3Rpb24gZGlzYWJsZU1hdGhKYXgoZGlzYWJsZTogYm9vbGVhbikge1xuICBpc01hdGhKYXhEaXNhYmxlZCA9IGRpc2FibGVcbn1cblxuLy9cbi8vIExvYWQgTWF0aEpheCBlbnZpcm9ubWVudFxuLy9cbi8vIEBwYXJhbSBsaXN0ZW5lciBtZXRob2QgdG8gY2FsbCB3aGVuIHRoZSBNYXRoSmF4IHNjcmlwdCB3YXMgYmVlblxuLy8gICBsb2FkZWQgdG8gdGhlIHdpbmRvdy4gVGhlIG1ldGhvZCBpcyBwYXNzZWQgbm8gYXJndW1lbnRzLlxuLy9cbmxldCBtalByb21pc2U6IFByb21pc2U8TWF0aEpheFN0dWI+XG5hc3luYyBmdW5jdGlvbiBsb2FkTWF0aEpheChyZW5kZXJlcjogTWF0aEpheFJlbmRlcmVyKTogUHJvbWlzZTxNYXRoSmF4U3R1Yj4ge1xuICBpZiAobWpQcm9taXNlKSByZXR1cm4gbWpQcm9taXNlXG4gIG1qUHJvbWlzZSA9IGF0dGFjaE1hdGhKYXgocmVuZGVyZXIpXG4gIHJldHVybiBtalByb21pc2Vcbn1cblxuZXhwb3J0IGNvbnN0IHRlc3RpbmcgPSB7XG4gIGxvYWRNYXRoSmF4LFxuICBkaXNhYmxlTWF0aEpheCxcbn1cblxuLy8gcHJpdmF0ZVxuXG5hc3luYyBmdW5jdGlvbiBnZXRVc2VyTWFjcm9zUGF0aCgpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBob21lID0gYXdhaXQgd2luZG93LmF0b21Ib21lXG4gIGNvbnN0IHVzZXJNYWNyb3NQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsID0gQ1NPTi5yZXNvbHZlKFxuICAgIHBhdGguam9pbihob21lLCAnbWFya2Rvd24tcHJldmlldy1wbHVzJyksXG4gIClcbiAgcmV0dXJuIHVzZXJNYWNyb3NQYXRoICE9IG51bGxcbiAgICA/IHVzZXJNYWNyb3NQYXRoXG4gICAgOiBwYXRoLmpvaW4oaG9tZSwgJ21hcmtkb3duLXByZXZpZXctcGx1cy5jc29uJylcbn1cblxuZnVuY3Rpb24gbG9hZE1hY3Jvc0ZpbGUoZmlsZVBhdGg6IHN0cmluZyk6IG9iamVjdCB7XG4gIGlmICghQ1NPTi5pc09iamVjdFBhdGgoZmlsZVBhdGgpKSB7XG4gICAgcmV0dXJuIHt9XG4gIH1cbiAgcmV0dXJuIENTT04ucmVhZEZpbGVTeW5jKGZpbGVQYXRoLCBmdW5jdGlvbihlcnJvcj86IEVycm9yLCBvYmplY3Q/OiBvYmplY3QpIHtcbiAgICBpZiAob2JqZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIG9iamVjdCA9IHt9XG4gICAgfVxuICAgIGlmIChlcnJvciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBFcnJvciByZWFkaW5nIExhdGV4IE1hY3JvcyBmaWxlICcke2ZpbGVQYXRofSc6ICR7XG4gICAgICAgICAgZXJyb3Iuc3RhY2sgIT09IHVuZGVmaW5lZCA/IGVycm9yLnN0YWNrIDogZXJyb3JcbiAgICAgICAgfWAsXG4gICAgICApXG4gICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBMYXRleCBNYWNyb3MgZnJvbSAnJHtmaWxlUGF0aH0nYCwge1xuICAgICAgICBkZXRhaWw6IGVycm9yLm1lc3NhZ2UsXG4gICAgICAgIGRpc21pc3NhYmxlOiB0cnVlLFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdFxuICB9KVxufVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkVXNlck1hY3JvcygpIHtcbiAgY29uc3QgdXNlck1hY3Jvc1BhdGggPSBhd2FpdCBnZXRVc2VyTWFjcm9zUGF0aCgpXG4gIGlmIChpc0ZpbGVTeW5jKHVzZXJNYWNyb3NQYXRoKSkge1xuICAgIHJldHVybiBsb2FkTWFjcm9zRmlsZSh1c2VyTWFjcm9zUGF0aClcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmRlYnVnKFxuICAgICAgJ0NyZWF0aW5nIG1hcmtkb3duLXByZXZpZXctcGx1cy5jc29uLCB0aGlzIGlzIGEgb25lLXRpbWUgb3BlcmF0aW9uLicsXG4gICAgKVxuICAgIGNyZWF0ZU1hY3Jvc1RlbXBsYXRlKHVzZXJNYWNyb3NQYXRoKVxuICAgIHJldHVybiBsb2FkTWFjcm9zRmlsZSh1c2VyTWFjcm9zUGF0aClcbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVNYWNyb3NUZW1wbGF0ZShmaWxlUGF0aDogc3RyaW5nKSB7XG4gIGNvbnN0IHRlbXBsYXRlUGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9hc3NldHMvbWFjcm9zLXRlbXBsYXRlLmNzb24nKVxuICBjb25zdCB0ZW1wbGF0ZUZpbGUgPSBmcy5yZWFkRmlsZVN5bmModGVtcGxhdGVQYXRoLCAndXRmOCcpXG4gIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHRlbXBsYXRlRmlsZSlcbn1cblxuZnVuY3Rpb24gY2hlY2tNYWNyb3MobWFjcm9zT2JqZWN0OiBvYmplY3QpIHtcbiAgY29uc3QgbmFtZVBhdHRlcm4gPSAvXlteYS16QS1aXFxkXFxzXSR8XlthLXpBLVpdKiQvIC8vIGxldHRlcnMsIGJ1dCBubyBudW1lcmFscy5cbiAgZm9yIChjb25zdCBuYW1lIGluIG1hY3Jvc09iamVjdCkge1xuICAgIGNvbnN0IHZhbHVlID0gbWFjcm9zT2JqZWN0W25hbWVdXG4gICAgaWYgKCFuYW1lLm1hdGNoKG5hbWVQYXR0ZXJuKSB8fCAhdmFsdWVNYXRjaGVzUGF0dGVybih2YWx1ZSkpIHtcbiAgICAgIGRlbGV0ZSBtYWNyb3NPYmplY3RbbmFtZV1cbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgdG8gbG9hZCBMYVRlWCBtYWNybyBuYW1lZCAnJHtuYW1lfScuIFBsZWFzZSBzZWUgdGhlIFtMYVRlWCBndWlkZV0oaHR0cHM6Ly9naXRodWIuY29tL2F0b20tY29tbXVuaXR5L21hcmtkb3duLXByZXZpZXctcGx1cy9ibG9iL21hc3Rlci9kb2NzL21hdGgubWQjbWFjcm8tbmFtZXMpYCxcbiAgICAgIClcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG1hY3Jvc09iamVjdFxufVxuXG5mdW5jdGlvbiB2YWx1ZU1hdGNoZXNQYXR0ZXJuKHZhbHVlOiBhbnkpIHtcbiAgLy8gRGlmZmVyZW50IGNoZWNrIGJhc2VkIG9uIHdoZXRoZXIgdmFsdWUgaXMgc3RyaW5nIG9yIGFycmF5XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgIGNvbnN0IG1hY3JvRGVmaW5pdGlvbiA9IHZhbHVlWzBdXG4gICAgY29uc3QgbnVtYmVyT2ZBcmdzID0gdmFsdWVbMV1cbiAgICBpZiAodHlwZW9mIG51bWJlck9mQXJncyA9PT0gJ251bWJlcicpIHtcbiAgICAgIHJldHVybiBudW1iZXJPZkFyZ3MgJSAxID09PSAwICYmIHR5cGVvZiBtYWNyb0RlZmluaXRpb24gPT09ICdzdHJpbmcnXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHRydWVcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG4vLyBDb25maWd1cmUgTWF0aEpheCBlbnZpcm9ubWVudC4gU2ltaWxhciB0byB0aGUgVGVYLUFNU19IVE1MIGNvbmZpZ3VyYXRpb24gd2l0aFxuLy8gYSBmZXcgdW5uZWNlc3NhcnkgZmVhdHVyZXMgc3RyaXBwZWQgYXdheVxuLy9cbmFzeW5jIGZ1bmN0aW9uIGNvbmZpZ3VyZU1hdGhKYXgoamF4OiBNYXRoSmF4U3R1YiwgcmVuZGVyZXI6IE1hdGhKYXhSZW5kZXJlcikge1xuICBsZXQgdXNlck1hY3JvcyA9IGF3YWl0IGxvYWRVc2VyTWFjcm9zKClcbiAgaWYgKHVzZXJNYWNyb3MpIHtcbiAgICB1c2VyTWFjcm9zID0gY2hlY2tNYWNyb3ModXNlck1hY3JvcylcbiAgfSBlbHNlIHtcbiAgICB1c2VyTWFjcm9zID0ge31cbiAgfVxuXG4gIGpheC5qYXhDb25maWd1cmUodXNlck1hY3JvcywgcmVuZGVyZXIpXG5cbiAgLy8gTm90aWZ5IHVzZXIgTWF0aEpheCBoYXMgbG9hZGVkXG4gIGNvbnNvbGUubG9nKCdMb2FkZWQgbWF0aHMgcmVuZGVyaW5nIGVuZ2luZSBNYXRoSmF4Jylcbn1cblxuLy9cbi8vIEF0dGFjaCBtYWluIE1hdGhKYXggc2NyaXB0IHRvIHRoZSBkb2N1bWVudFxuLy9cbmFzeW5jIGZ1bmN0aW9uIGF0dGFjaE1hdGhKYXgocmVuZGVyZXI6IE1hdGhKYXhSZW5kZXJlcik6IFByb21pc2U8TWF0aEpheFN0dWI+IHtcbiAgY29uc29sZS5sb2coJ0xvYWRpbmcgbWF0aHMgcmVuZGVyaW5nIGVuZ2luZSBNYXRoSmF4JylcblxuICAvLyBBdHRhY2ggTWF0aEpheCBzY3JpcHRcbiAgYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgIGluamVjdFNjcmlwdChgJHtyZXF1aXJlLnJlc29sdmUoJ21hdGhqYXgnKX0/ZGVsYXlTdGFydHVwVW50aWw9Y29uZmlndXJlZGApLFxuICBdKVxuICBjb25zdCB7IG1hdGhKYXhTdHViIH0gPSBhd2FpdCBpbXBvcnQoJy4vbWF0aGpheC1zdHViJylcbiAgYXdhaXQgY29uZmlndXJlTWF0aEpheChtYXRoSmF4U3R1YiwgcmVuZGVyZXIpXG4gIHJldHVybiBtYXRoSmF4U3R1YlxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaW5qZWN0U2NyaXB0KHNjcmlwdFNyYzogc3RyaW5nKSB7XG4gIGNvbnN0IHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpXG4gIHNjcmlwdC5zcmMgPSBzY3JpcHRTcmNcbiAgc2NyaXB0LnR5cGUgPSAndGV4dC9qYXZhc2NyaXB0J1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHNjcmlwdClcbiAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgc2NyaXB0LmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCAoKSA9PiByZXNvbHZlKCkpXG4gIH0pXG59XG4iXX0=