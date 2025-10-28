const path = require('path');
const fs = require('fs');
const showdown  = require('showdown');
const htmlFormat = require('html-format');
const mathjax = require('mathjax-node');

const TEMPLATE_FOLDER = "template";
const OUTPUT_FOLDER = "dist";

// --- UTILS ---

function emptyFolder(folder) {
    folder = path.resolve(folder);

    if (!fs.existsSync(folder)){
        return;
    }

    fs.readdirSync(folder).forEach(file => {
        let fullPath = path.join(folder, file);
        let stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            emptyFolder(fullPath);
            fs.rmdirSync(fullPath);
        } else {
            fs.unlinkSync(fullPath);
        }
    });
}

function fillFolder(source, destination) {
    source = path.resolve(source);
    destination = path.resolve(destination);

    if (!fs.existsSync(destination)){
        fs.mkdirSync(destination, { recursive: true });
    }

    fs.readdirSync(source).forEach(file => {
        let sourcePath = path.join(source, file);
        let destPath = path.join(destination, file);
        let stat = fs.statSync(sourcePath);
        if (stat.isDirectory()) {
            fillFolder(sourcePath, destPath);
        } else {
            fs.copyFileSync(sourcePath, destPath);
        }
    });
}

// --- BUILD STEPS ---

function readSource(folder) {
    // Read all the files in the folder
    let files = [];
    fs.readdirSync(folder).forEach(file => {
        // Check if it's a lesson maker file
        if (!file.startsWith("alm_") || !file.endsWith(".md")) {
            return;
        }

        let fullPath = path.join(folder, file);
        let stat = fs.statSync(fullPath);
        if (stat.isFile()) {
            files.push(file);
        }
    });

    // Concatenate all the files
    let rawMarkdown = "";
    files.forEach(file => {
        let fullPath = path.join(folder, file);
        let content = fs.readFileSync(fullPath, 'utf8');
        rawMarkdown += content + "\n\n";
    });

    return rawMarkdown;
}

async function parseMathStrings(markdown) {
    // Configure MathJax
    //Add macros for llbracket and rrbracket
    mathjax.config({
        MathJax: {
            TeX: {
                Macros: {
                    llbracket: "\\left[",
                    rrbracket: "\\right] \\cap \\mathbb{Z}"
                }
            }
        }
    });
    mathjax.start();

    async function renderMathToSVG(mathString) {
        try {
            let promise = await mathjax.typeset({
                math: mathString,
                format: "TeX",
                svg: true,
                speakText: false
            });

            return promise.svg;
        } catch (error) {
            console.error("MathJax processing error:", error, mathString);
            return mathString;
        }
    }

    // Build the output
    let mathCode = {};
    let mathIndex = 0;

    function generateMathPlaceholder(code) {
        mathIndex++;
        let placeholder = `@@MATH${mathIndex}@@`;
        mathCode[placeholder] = code;
        return placeholder;
    }

    // First, we look for all of the "\$" strings and replace them with "&dollar;" to avoid conflicts
    markdown = markdown.split("\\$").join("&dollar;");

    // Now, we look for all the math strings delimited by "$$...$$" and format them using MathJax
    while (markdown.includes("$$")) {
        let startIndex = markdown.indexOf("$$");
        let endIndex = markdown.indexOf("$$", startIndex + 2);
        if (endIndex === -1) {
            console.error("Unmatched $$ found in markdown.");
            break;
        }

        let mathContent = markdown.substring(startIndex + 2, endIndex);
        mathContent = await renderMathToSVG(mathContent);
        let mathHTML = `<span class="math-block">${mathContent}</span>`;

        markdown = markdown.substring(0, startIndex) + generateMathPlaceholder(mathHTML) + markdown.substring(endIndex + 2);
    }

    // Finally, we look for all the math strings delimited by "$...$" and format them using MathJax
    while (markdown.includes("$")) {
        let startIndex = markdown.indexOf("$");
        let endIndex = markdown.indexOf("$", startIndex + 1);
        if (endIndex === -1) {
            console.error("Unmatched $ found in markdown.");
            break;
        }

        let mathContent = markdown.substring(startIndex + 1, endIndex);
        mathContent = await renderMathToSVG(mathContent);
        let mathHTML = `<span class="math-inline">${mathContent}</span>`;

        markdown = markdown.substring(0, startIndex) + generateMathPlaceholder(mathHTML) + markdown.substring(endIndex + 1);
    }

    return [markdown, mathCode];
}

function buildRawHTML(markdown) {
    // Convert markdown to HTML
    require("showdown-youtube");
    const converter = new showdown.Converter({
        noHeaderId: true,
        tables: true,
        extensions: [
            require("showdown-highlight")({
                pre: true,
                auto_detection: true
            }),
            "youtube"
        ]
    });
    let rawHTML = converter.makeHtml(markdown);
    return rawHTML;
}

function parseTitles(html) {
    let sectionCounter = 0;
    let subsectionCounter = 0;
    let indentBoxLayer = 0;

    let inputIndex = 0;
    let outputHtml = "";

    function closeBoxLayer(layer) {
        if (indentBoxLayer >= layer) {
            for (let j = indentBoxLayer; j >= layer; j--) {
                outputHtml += "</div></div>\n";
            }
            indentBoxLayer = layer - 1;
        }
    }

    const knownPropertyTitles = [
        "Définition",
        "Propriété",
        "Théorème",
        "Remarque",
        "Lemme",
        "Corollaire",
        "Notation",
        "Démonstration",
        "Vocabulaire"
    ]
    const examplePropertyTitle = "Exemple";

    while (inputIndex < html.length) {
        if (html.startsWith("<h1>", inputIndex)) {
            closeBoxLayer(1);

            sectionCounter++;
            subsectionCounter = 0;

            let endIndex = html.indexOf("</h1>", inputIndex);
            let titleText = html.substring(inputIndex + 4, endIndex).trim();
            outputHtml += "<h2>"+ sectionCounter + ". " + titleText +"</h2>\n";
            inputIndex = endIndex + 5;
        } else if (html.startsWith("<h2>", inputIndex)) {
            closeBoxLayer(1);

            subsectionCounter++;

            let endIndex = html.indexOf("</h2>", inputIndex);
            let titleText = html.substring(inputIndex + 4, endIndex).trim();
            outputHtml += "<h3>"+ sectionCounter + "." + subsectionCounter + " " + titleText +"</h3>\n";
            inputIndex = endIndex + 5;
        } else if (html.startsWith("<h3>", inputIndex)) {
            closeBoxLayer(1);
            if (indentBoxLayer != 0) {
                console.error("Indent box layer mismatch at index " + inputIndex);
            }
            indentBoxLayer = 1;

            let endIndex = html.indexOf("</h3>", inputIndex);
            let titleText = html.substring(inputIndex + 4, endIndex).trim();
            let extraText = "";

            if (titleText.includes(" (") && titleText.endsWith(")")) {
                let splitIndex = titleText.lastIndexOf(" (");
                extraText = titleText.substring(splitIndex + 2, titleText.length - 1).trim();
                titleText = titleText.substring(0, splitIndex).trim();
            }

            if (titleText === examplePropertyTitle) {
                outputHtml += `<div class="indent-box"><h4 class="example"><span class="title">ex</span>&nbsp;: <span class="extra">${extraText}</span></h4><div class="content">\n`;
            } else {
                let unknownTitle = "";
                if (!knownPropertyTitles.includes(titleText)) {
                    unknownTitle = " unknown";
                }
                outputHtml += `<div class="indent-box border"><h4><span class="title${unknownTitle}">${titleText}</span>&nbsp;: <span class="extra">${extraText}</span></h4><div class="content">\n`;
            }

            inputIndex = endIndex + 5;
        } else if (html.startsWith("<h4>", inputIndex)) {
            closeBoxLayer(2);
            if (indentBoxLayer != 1) {
                console.error("Indent box layer mismatch at index " + inputIndex);
            }
            indentBoxLayer = 2;

            let endIndex = html.indexOf("</h4>", inputIndex);
            let titleText = html.substring(inputIndex + 4, endIndex).trim();
            let extraText = "";

            if (titleText.includes(" (") && titleText.endsWith(")")) {
                let splitIndex = titleText.lastIndexOf(" (");
                extraText = titleText.substring(splitIndex + 2, titleText.length - 1).trim();
                titleText = titleText.substring(0, splitIndex).trim();
            }

            outputHtml += `<div class="indent-box"><h5><span class="title">${titleText}</span>&nbsp;: <span class="extra">${extraText}</span></h5><div class="content">\n`;

            inputIndex = endIndex + 5;
        } else {
            outputHtml += html[inputIndex];
            inputIndex++;
        }
    }

    return outputHtml;
}

function fixTables(html) {
    html = html.split("<table>").join('<div class="table-container"><table>');
    html = html.split("</table>").join('</table></div>');
    return html;
}

function replaceMathPlaceholders(html, mathCode) {
    for (let placeholder in mathCode) {
        html = html.split(placeholder).join(mathCode[placeholder]);
    }
    return html;
}

function outputLesson(title, html) {
    // Delete all the files and folders from previous builds
    emptyFolder(OUTPUT_FOLDER);
    // Copy all the files from the template folder
    fillFolder(TEMPLATE_FOLDER, OUTPUT_FOLDER);

    // Fill the HTML file
    let indexPath = path.join(OUTPUT_FOLDER, "index.html");
    let indexCode = fs.readFileSync(indexPath, 'utf8');
    indexCode = indexCode.split("${title}").join(title);
    indexCode = indexCode.split("${content}").join(html);

    // Format the HTML code
    indexCode = htmlFormat(indexCode);

    // Write the final HTML file
    fs.writeFileSync(indexPath, indexCode, 'utf8');
}

async function build(folder, title) {
    console.log("Building " + title + " at " + folder);

    // Process the source files
    let mathCode = null;
    let markdown = readSource(folder);
    [markdown, mathCode] = await parseMathStrings(markdown);
    let html = buildRawHTML(markdown);
    html = parseTitles(html);
    html = fixTables(html);
    html = replaceMathPlaceholders(html, mathCode);

    // Output the final page with all its assets
    outputLesson(title, html);
}

// --- MAIN ---

async function main() {
    if (process.argv.length != 4) {
        console.log("Please provide a folder to build with a title to the lesson.");
        return;
    }

    folder = path.resolve(process.argv[2]);
    title = process.argv[3];
    await build(folder, title);
}

main();