
import { Rcon } from 'rcon-client';

const connection = await Rcon.connect({
  host: process.env.RCON_HOST,
  port: Number(process.env.RCON_PORT),
  password: process.env.RCON_PASSWORD,
  timeout: 10000
});

try {
  console.log('Sending IcePackPing to Nitrado...');

  const response = await connection.send(
    'ScriptCommand IcePackPing'
  );

  console.log('RCON response:', response);
} catch (error) {
  console.error('RCON command failed:', error.message);
} finally {
  await connection.end();
}
