const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, 'src', 'features', 'orders');

const structure = {
  pages: ['OrdersPage.tsx'],

  sections: [
    'OrderBillingSection.tsx',
    'TrayTrackingSection.tsx',
    'CollectionSection.tsx',
    'SheetSummarySection.tsx',
  ],

  components: {
    header: [],
    grids: [],
    toolbars: [],
    editors: [],
    summary: [],
    shared: [],
  },

  hooks: [
    'useOrdersPage.ts',
    'useOrderBilling.ts',
    'useTrayTracking.ts',
    'useCollections.ts',
  ],

  store: ['orders.store.ts'],

  services: ['orders.api.ts'],

  types: [
    'order.types.ts',
    'tray.types.ts',
    'collection.types.ts',
  ],

  utils: [
    'orders.columns.ts',
    'trays.columns.ts',
    'collections.columns.ts',
    'calculations.ts',
    'transformers.ts',
  ],

  constants: ['order.constants.ts'],
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '');
  }
}

function processStructure(currentPath, obj) {
  for (const key in obj) {
    const value = obj[key];
    const targetPath = path.join(currentPath, key);

    ensureDir(targetPath);

    if (Array.isArray(value)) {
      value.forEach((file) => {
        createFile(path.join(targetPath, file));
      });
    } else {
      processStructure(targetPath, value);
    }
  }
}

ensureDir(base);
processStructure(base, structure);

console.log('Orders feature structure created successfully.');