import crypto from 'node:crypto';

function parseStored(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function collectStrings(value, strings) {
  value = parseStored(value);
  if (typeof value === 'string') { strings.add(value); return; }
  if (Array.isArray(value)) { for (const item of value) collectStrings(item, strings); return; }
  if (value && typeof value === 'object') for (const item of Object.values(value)) collectStrings(item, strings);
}

export function buildCloudinaryReferenceIndex({ media = [], teachers = [], banners = [], contents = [], revisions = [], enquiries = [], retainedAssets = [] }) {
  const references = new Map();
  for (const [category, collection] of Object.entries({ media, teachers, banners, contents, revisions, enquiries, retainedAssets })) {
    for (const record of collection) {
      const values = new Set(); collectStrings(record, values);
      for (const value of values) {
        const categories = references.get(value) || new Set();
        categories.add(category); references.set(value, categories);
      }
    }
  }
  for (const record of retainedAssets) if (record.secure_url_hash) {
    const key = `url-sha256:${record.secure_url_hash}`;
    const categories = references.get(key) || new Set(); categories.add('retainedAssets'); references.set(key, categories);
  }
  return references;
}

export function classifyCloudinaryAsset(asset, referenceIndex) {
  const publicId = asset.public_id || '';
  const folder = String(asset.asset_folder || asset.folder || '');
  const appNamespace = publicId === 'tutorathome' || publicId.startsWith('tutorathome/') || folder === 'tutorathome' || folder.startsWith('tutorathome/');
  const secureUrlHash = asset.secure_url ? crypto.createHash('sha256').update(asset.secure_url).digest('hex') : '';
  const referenceCategories = referenceIndex.get(publicId) || referenceIndex.get(asset.secure_url) || (secureUrlHash && referenceIndex.get(`url-sha256:${secureUrlHash}`)) || new Set();
  const referenced = referenceCategories.size > 0;
  if (referenced) return { classification: 'referenced', ownership: 'application_database_reference', referenceCategories: [...referenceCategories] };
  if (appNamespace) return { classification: 'candidate_unreferenced', ownership: 'tutorathome_namespace', referenceCategories: [] };
  return { classification: 'ownership_unknown', ownership: 'unknown', referenceCategories: [] };
}

