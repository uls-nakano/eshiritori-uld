import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { loadConfig } from "../lib/config.mjs";

const { directories, domainSources } = loadConfig();

/** domainDocsDirectory はドメインモデル図の置き場です。直下のフォルダ名が package 名に対応します。 */
const domainDocsDirectory = directories.domainDocs;

/** packagesDirectory はドメインモデル図と突き合わせる実装の置き場です（uld.config.json の domainSources）。 */
const packagesDirectory = domainSources.packagesDirectory;

/** domainSubdirectory は package 内の domain 層のフォルダです。 */
const domainSubdirectory = domainSources.domainSubdirectory;

/**
 * requiredStereotypePattern は colocate 単体テストとの突き合わせを要求するステレオタイプです。
 * Repository / Application Port（実装側のテストで検証）・入力型・Raw Record（関数を持たない）は対象外にします。
 */
const requiredStereotypePattern = /Entity|Aggregate Root|Value Object|Domain Service/u;

/** classHeaderPattern は classDiagram のクラス宣言行を判定します。 */
const classHeaderPattern = /^\s*class (\w+)/u;

/** methodPattern はクラスブロック内の公開メソッド行（`+name(...)`）を判定します。属性行には括弧がありません。 */
const methodPattern = /^\s*\+(\w+)\(/u;

/** stereotypePattern はクラスブロック内のステレオタイプ行を判定します。 */
const stereotypePattern = /^\s*<<(.+)>>\s*$/u;

/** getterPattern は実装ソース内の getter 宣言を判定します。getter は describe を要求しません。 */
const getterPattern = /(?:^|\s)get\s+(\w+)\s*\(/gu;

/**
 * memberDeclarationPattern は実装ソース内のクラスメンバー宣言行（修飾子 + 名前 + 型引数 + `(`、
 * または名前 + `=` + アロー関数）を判定します。図にあって実装にまだ無い関数を見分けるために使います。
 * 行頭の宣言だけを拾うので、`this.foo(` のような呼び出しやモジュール直下の `function foo(` は数えません。
 * 行頭の素の呼び出し（`validate(`）は宣言として数えてしまいますが、その誤りは「describe を要求する」側に倒れ、
 * 検出を静かに無効化する方向には効きません。
 */
const memberDeclarationPattern =
  /^\s*(?:(?:public|protected|private|static|readonly|abstract|declare|async|override|get|set)\s+)*(\w+)\s*(?:<[^>]*>)?\s*(?:\(|=\s*(?:async\s*)?(?:<[^>]*>)?\()/gmu;

/** controlKeywords は memberDeclarationPattern が拾ってしまう制御構文のキーワードです。メンバー名から除きます。 */
const controlKeywords = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "constructor",
  "super"
]);

/** describePattern はテストコードの describe 名を拾います。`create / equals` のような並記は分割して扱います。 */
const describePattern = /describe\(\s*"([^"]+)"/gu;

/** identifierPattern は describe 名の断片が関数名の形（英数字の識別子）かを判定します。 */
const identifierPattern = /^[A-Za-z]\w*$/u;

/**
 * themeDirective は mermaid ブロックの先頭に置くテーマ指定です。
 * 閲覧環境の明暗テーマに配色を委ねると、ダークテーマでは文字色が明色になり淡色の塗りの上で読めなくなります。
 * 文字色・線色・関連ラベルの下地を図側で固定して、どちらのテーマでも同じ見え方にします。
 */
const themeDirective =
  '%%{init: {"theme": "base", "themeVariables": {"nodeBorder": "#37474F", "classText": "#212121", "mainBkg": "#FFFFFF", "lineColor": "#6E7F8D"}, "themeCSS": ".edgeTerminals .edgeLabel p { background: #FFFFFF; color: #212121; padding: 0 2px; border-radius: 2px; }"}}%%';

/** listMarkdownFiles は directory 配下の Markdown ファイルを再帰的に集めます。 */
function listMarkdownFiles(directoryPath) {
  const markdownFiles = [];

  for (const entryName of readdirSync(directoryPath)) {
    const entryPath = join(directoryPath, entryName);

    if (statSync(entryPath).isDirectory()) {
      markdownFiles.push(...listMarkdownFiles(entryPath));
    } else if (entryName.endsWith(".md")) {
      markdownFiles.push(entryPath);
    }
  }

  return markdownFiles;
}

/** collectDiagramClasses はモデル図の全クラスを {stereotypes, methods} の形に集めます。複数の図に登場するクラスは合成します。 */
function collectDiagramClasses() {
  const diagramClasses = new Map();

  for (const filePath of listMarkdownFiles(domainDocsDirectory)) {
    let currentClass = null;

    for (const line of readFileSync(filePath, "utf8").split("\n")) {
      const classHeader = classHeaderPattern.exec(line);

      if (classHeader) {
        const className = classHeader[1];
        currentClass = diagramClasses.get(className) ?? {
          stereotypes: new Set(),
          methods: new Set()
        };
        diagramClasses.set(className, currentClass);
        continue;
      }

      if (!currentClass) {
        continue;
      }

      if (/^\s*\}/u.test(line)) {
        currentClass = null;
        continue;
      }

      const stereotype = stereotypePattern.exec(line);
      if (stereotype) {
        currentClass.stereotypes.add(stereotype[1]);
        continue;
      }

      const method = methodPattern.exec(line);
      if (method) {
        currentClass.methods.add(method[1]);
      }
    }
  }

  return diagramClasses;
}

/** listDomainSourceFiles は docs/domain のフォルダ名に対応する package の domain 層ソースを集めます。 */
function listDomainSourceFiles() {
  const sourceFiles = [];

  for (const packageName of readdirSync(domainDocsDirectory)) {
    const domainSourceDirectory = join(packagesDirectory, packageName, domainSubdirectory);

    if (
      !statSync(join(domainDocsDirectory, packageName), { throwIfNoEntry: false })?.isDirectory() ||
      !existsSync(domainSourceDirectory)
    ) {
      continue;
    }

    const walk = (directoryPath) => {
      for (const entryName of readdirSync(directoryPath)) {
        const entryPath = join(directoryPath, entryName);

        if (statSync(entryPath).isDirectory()) {
          walk(entryPath);
        } else if (entryName.endsWith(".ts") && !entryName.endsWith(".test.ts")) {
          sourceFiles.push(entryPath);
        }
      }
    };
    walk(domainSourceDirectory);
  }

  return sourceFiles;
}

/** collectGetterNames は実装ソースの getter 名を集めます。 */
function collectGetterNames(sourceText) {
  return new Set([...sourceText.matchAll(getterPattern)].map((match) => match[1]));
}

/** collectDeclaredMemberNames は実装ソースで宣言済みのクラスメンバー名を集めます。 */
function collectDeclaredMemberNames(sourceText) {
  return new Set(
    [...sourceText.matchAll(memberDeclarationPattern)]
      .map((match) => match[1])
      .filter((memberName) => !controlKeywords.has(memberName))
  );
}

/** collectDescribeNames はテストコードの describe 名を並記の分割込みで集めます。 */
function collectDescribeNames(testText) {
  const describeNames = new Set();

  for (const match of testText.matchAll(describePattern)) {
    for (const segment of match[1].split("/")) {
      describeNames.add(segment.trim());
    }
  }

  return describeNames;
}

/** collectThemeDirectiveViolations はテーマ指定を先頭に持たない mermaid ブロックを列挙します。 */
function collectThemeDirectiveViolations() {
  const themeViolations = [];

  for (const filePath of listMarkdownFiles(domainDocsDirectory)) {
    const lines = readFileSync(filePath, "utf8").split("\n");

    for (const [lineIndex, line] of lines.entries()) {
      if (line.trim() !== "```mermaid") {
        continue;
      }

      const firstLine = lines[lineIndex + 1]?.trim();
      const diagramLine = firstLine?.startsWith("%%{") ? lines[lineIndex + 2]?.trim() : firstLine;

      /*
       * テーマ指定を要求するのは classDiagram だけです。塗りを style 文で固定しているのはモデル図だけで、
       * 塗りを固定しない図（シーケンス図など）は閲覧側のテーマのままでも文字と線の対比が保たれます。
       */
      if (diagramLine !== "classDiagram") {
        continue;
      }

      if (firstLine !== themeDirective) {
        themeViolations.push(
          `テーマ指定無し: ${filePath}:${lineIndex + 2} の mermaid ブロックの先頭がテーマ指定行と一致しません（明暗どちらのテーマでも読めるようにするため rules/model-design の指定行をそのまま置きます）`
        );
      }
    }
  }

  return themeViolations;
}

// モデル図の置き場が無いリポジトリ（ドメインモデルを図で持たない段階）では検証対象が無い。
// 静かに通すのではなく対象なしを明示して、設定の書き間違いに気づけるようにする。
if (!existsSync(domainDocsDirectory)) {
  process.stdout.write(`check:model-trace 対象なし — ${domainDocsDirectory} がありません\n`);
  process.exit(0);
}

const diagramClasses = collectDiagramClasses();
const violations = [...collectThemeDirectiveViolations()];

for (const sourcePath of listDomainSourceFiles()) {
  const className = basename(sourcePath, ".ts");
  const diagramClass = diagramClasses.get(className);

  // クラスレベルの逆方向チェック: domain 層のクラスがどの図にも無いのは図の更新漏れ。
  if (!diagramClass) {
    violations.push(`図に無いクラス: ${sourcePath} がどのモデル図にも登場しません`);
    continue;
  }

  const stereotypeText = [...diagramClass.stereotypes].join(" ");
  if (!requiredStereotypePattern.test(stereotypeText)) {
    continue;
  }

  const testPath = sourcePath.replace(/\.ts$/u, ".test.ts");
  if (!existsSync(testPath)) {
    violations.push(`テスト無し: ${className} に colocate 単体テストがありません(${testPath})`);
    continue;
  }

  const sourceText = readFileSync(sourcePath, "utf8");
  const getterNames = collectGetterNames(sourceText);
  const declaredMemberNames = collectDeclaredMemberNames(sourceText);
  const describeNames = collectDescribeNames(readFileSync(testPath, "utf8"));

  for (const methodName of diagramClass.methods) {
    // 図にあって実装にまだ無い関数は設計先行（図 → 実装の順）の状態で、仕様の抜けではない。
    // 実装が追いついた時点から describe の有無を検出する。実装したのに図に載せていない関数は、
    // そのテストの describe が「図に無い関数」として検出される。
    if (!declaredMemberNames.has(methodName)) {
      continue;
    }

    if (!getterNames.has(methodName) && !describeNames.has(methodName)) {
      violations.push(
        `describe 無し: 図の ${className}.${methodName} に対応する describe("${methodName}") が ${testPath} にありません`
      );
    }
  }

  for (const describeName of describeNames) {
    if (identifierPattern.test(describeName) && !diagramClass.methods.has(describeName)) {
      violations.push(
        `図に無い関数: ${testPath} の describe("${describeName}") が図の ${className} に載っていません`
      );
    }
  }
}

if (violations.length > 0) {
  process.stderr.write("model trace violation:\n");
  for (const violation of violations) {
    process.stderr.write(`- ${violation}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `check:model-trace OK — モデル図の ${diagramClasses.size} クラスと colocate テストの describe が対応し、全図がテーマ指定を持っています\n`
);
