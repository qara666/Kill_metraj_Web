// scripts/generate_function_report.js
/**
 * Преобразует JSON‑отчёт, созданный analyze_functions.js, в markdown‑документ
 * с рекомендациями по улучшению функций.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const reportPath = path.join(ROOT, 'temp', 'function_report.json');
const outputPath = path.join(ROOT, 'docs', 'FUNCTION_ANALYSIS.md');

function loadReport() {
    if (!fs.existsSync(reportPath)) {
        console.error('Report not found at', reportPath);
        process.exit(1);
    }
    const raw = fs.readFileSync(reportPath, 'utf8');
    return JSON.parse(raw);
}

function suggestImprovement(fn) {
    const suggestions = [];
    if (fn.lineCount > 50) suggestions.push('Разбить на более мелкие функции');
    if (fn.params > 3) suggestions.push('Сократить количество параметров');
    if (fn.type === 'component' && fn.file.endsWith('.tsx')) {
        suggestions.push('Добавить/проверить типизацию Props');
    }
    if (fn.type === 'hook') {
        suggestions.push('Убедиться в соблюдении правил хуков');
    }
    if (suggestions.length === 0) suggestions.push('Нет явных проблем');
    return suggestions.join('; ');
}

function generateMarkdown(report) {
    const header = `# Анализ функций проекта Kill_metraj_Web\n\n` +
        `| Файл | Функция | Тип | Строки | Параметры | Предложения |\n` +
        `| ---- | ------- | ---- | ------ | --------- | ------------ |\n`;
    const rows = report.map(fn => {
        const relPath = path.relative(ROOT, fn.file);
        const suggestion = suggestImprovement(fn);
        return `| ${relPath} | ${fn.name} | ${fn.type} | ${fn.lineCount} | ${fn.params} | ${suggestion} |`;
    }).join('\n');
    return header + rows + '\n';
}

function main() {
    const report = loadReport();
    const markdown = generateMarkdown(report);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, markdown, 'utf8');
    console.log('Function analysis markdown written to', outputPath);
}

main();
