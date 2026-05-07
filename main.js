const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

const program = new Command();
program
  .requiredOption('-h, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <path>', 'шлях до директорії для зберігання фото');

program.parse(process.argv);
const options = program.opts();
const app = express();
const PORT = options.port;
const HOST = options.host;
const UPLOAD_DIR = path.resolve(options.cache);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`Створено директорію для фото: ${UPLOAD_DIR}`);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({ storage });

let inventories = [];

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const findIndex = (id) => inventories.findIndex(item => item.id === id);


// 1. POST /register – реєстрація (multipart/form-data)
app.post('/register', upload.single('photo'), (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const newItem = {
    id: uuidv4(),
    name: inventory_name,
    description: description || '',
    photoPath: req.file ? `/uploads/${req.file.filename}` : null,
  };
  inventories.push(newItem);
  res.status(201).json({ message: 'Created', id: newItem.id });
});

// 2. GET /inventory – список всіх речей
app.get('/inventory', (req, res) => {
  const result = inventories.map(item => ({
    id: item.id,
    name: item.name,
    description: item.description,
    photoUrl: item.photoPath ? `http://${HOST}:${PORT}${item.photoPath}` : null,
  }));
  res.json(result);
});

// 3. GET /inventory/:id – отримати одну річ
app.get('/inventory/:id', (req, res) => {
  const item = inventories.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: item.id,
    name: item.name,
    description: item.description,
    photoUrl: item.photoPath ? `http://${HOST}:${PORT}${item.photoPath}` : null,
  });
});

// 4. PUT /inventory/:id – оновити назву або опис
app.put('/inventory/:id', (req, res) => {
  const idx = findIndex(req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { name, description } = req.body;
  if (name !== undefined) inventories[idx].name = name;
  if (description !== undefined) inventories[idx].description = description;
  res.status(200).json({ message: 'Updated' });
});

// 5. GET /inventory/:id/photo – отримати фото
app.get('/inventory/:id/photo', (req, res) => {
  const item = inventories.find(i => i.id === req.params.id);
  if (!item || !item.photoPath) return res.status(404).json({ error: 'Photo not found' });
  const filePath = path.join(UPLOAD_DIR, path.basename(item.photoPath));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });
  res.sendFile(filePath);
});

// 6. PUT /inventory/:id/photo – оновити фото
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
  const idx = findIndex(req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Inventory not found' });
  if (!req.file) return res.status(400).json({ error: 'Photo file is required' });
  if (inventories[idx].photoPath) {
    const oldPath = path.join(UPLOAD_DIR, path.basename(inventories[idx].photoPath));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  inventories[idx].photoPath = `/uploads/${req.file.filename}`;
  res.status(200).json({ message: 'Photo updated' });
});

// 7. DELETE /inventory/:id – видалити річ
app.delete('/inventory/:id', (req, res) => {
  const idx = findIndex(req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const item = inventories[idx];
  if (item.photoPath) {
    const filePath = path.join(UPLOAD_DIR, path.basename(item.photoPath));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  inventories.splice(idx, 1);
  res.status(200).json({ message: 'Deleted' });
});

// 8. POST /search – пошук за ID (x-www-form-urlencoded)
app.post('/search', express.urlencoded({ extended: true }), (req, res) => {
  const { id, has_photo } = req.body;
  const item = inventories.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  let description = item.description;
  if (has_photo === 'on' || has_photo === 'true') {
    const photoLink = `http://${HOST}:${PORT}${item.photoPath || ''}`;
    description += ` (Photo: ${photoLink})`;
  }
  res.json({ id: item.id, name: item.name, description });
});

app.use('/uploads', express.static(UPLOAD_DIR));

app.listen(PORT, HOST, () => {
  console.log(`✅ Server running at http://${HOST}:${PORT}/`);
  console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
});