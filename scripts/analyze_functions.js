// scripts/analyze_functions.js
/**
 * Анализирует все функции в проекте Kill_metraj_Web (backend и frontend).
 * Генерирует JSON‑отчёт с информацией о каждой функции:
 *   - файл
 *   - тип (controller, service, component, hook, util и т.д.) (определяется по пути)
 *   - имя функции
 *   - диапазон строк
 *   - количество строк
 *   - количество параметров
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Папки для сканирования
const ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend', 'src');
const FRONTEND_DIR = path.join(ROOT, 'frontend', 'src');

function* walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else yield full;
    }
}

function isJSorTS(file) {
    return file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx');
}

function getFileType(filePath) {
    const rel = path.relative(ROOT, filePath);
    if (rel.startsWith('backend')) return 'backend';
    if (rel.startsWith('frontend/src/components')) return 'component';
    if (rel.startsWith('frontend/src/hooks')) return 'hook';
    if (rel.startsWith('frontend/src/utils')) return 'util';
    if (rel.startsWith('frontend/src/services')) return 'service';
    return 'other';
}

function analyzeFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx', 'classProperties', 'decorators-legacy'],
        });
    } catch (e) {
        console.warn(`Skipping ${filePath}: ${e.message}`);
        return [];
    }
    const functions = [];
    traverse(ast, {
        FunctionDeclaration(path) {
            const node = path.node;
            functions.push({
                name: node.id ? node.id.name : '<anonymous>',
                startLine: node.loc.start.line,
                endLine: node.loc.end.line,
                params: node.params.length,
            });
        },
        ArrowFunctionExpression(path) {
            // Arrow functions assigned to a variable
            const parent = path.parent;
            if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
                const node = path.node;
                functions.push({
                    name: parent.id.name,
                    startLine: node.loc.start.line,
                    endLine: node.loc.end.line,
                    params: node.params.length,
                });
            }
        },
        FunctionExpression(path) {
            const parent = path.parent;
            if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
                const node = path.node;
                functions.push({
                    name: parent.id.name,
                    startLine: node.loc.start.line,
                    endLine: node.loc.end.line,
                    params: node.params.length,
                });
            }
        },
    });
    return functions.map(fn => ({
        file: filePath,
        type: getFileType(filePath),
        name: fn.name,
        startLine: fn.startLine,
        endLine: fn.endLine,
        lineCount: fn.endLine - fn.startLine + 1,
        params: fn.params,
    }));
}

function main() {
    const report = [];
    const dirs = [BACKEND_DIR, FRONTEND_DIR];
    for (const baseDir of dirs) {
        for (const file of walk(baseDir)) {
            if (!isJSorTS(file)) continue;
            const funcs = analyzeFile(file);
            report.push(...funcs);
        }
    }
    const outPath = path.join(ROOT, 'temp', 'function_report.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('Function analysis report written to', outPath);
}

main();
