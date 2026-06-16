import 'dotenv/config';
import app, { runMigrations } from './app';

const PORT = Number(process.env.PORT) || 3333;

// Run migrations BEFORE accepting any requests
runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Falha crítica nas migrations:', err);
  process.exit(1);
});
