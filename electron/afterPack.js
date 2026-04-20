const { cp, mkdir } = require("fs/promises");
const path = require("path");

/**
 * afterPack hook — copies the Next.js standalone server into the app bundle.
 * electron-builder's extraResources filter strips node_modules and .next dirs
 * by default; doing it here bypasses those ignore rules.
 */
exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;
  const productName = context.packager.appInfo.productName;

  let resourcesDir;
  if (electronPlatformName === "darwin") {
    resourcesDir = path.join(appOutDir, `${productName}.app`, "Contents", "Resources");
  } else {
    // Windows (nsis/portable) and Linux (AppImage)
    resourcesDir = path.join(appOutDir, "resources");
  }

  const projectRoot = path.join(__dirname, "..");
  const standaloneSource = path.join(projectRoot, ".next", "standalone-resolved");
  const staticSource = path.join(projectRoot, ".next", "static");
  const standaloneTarget = path.join(resourcesDir, "standalone");

  await mkdir(standaloneTarget, { recursive: true });
  await cp(standaloneSource, standaloneTarget, { recursive: true, force: true });
  await cp(staticSource, path.join(standaloneTarget, ".next", "static"), {
    recursive: true,
    force: true,
  });

  const teiSource = path.join(projectRoot, "shakedracor", "tei");
  await cp(teiSource, path.join(standaloneTarget, "shakedracor", "tei"), { recursive: true, force: true });

  console.log(`  • copied standalone Next.js server to ${standaloneTarget}`);
  console.log(`  • copied shakedracor/tei into standalone bundle`);
};
