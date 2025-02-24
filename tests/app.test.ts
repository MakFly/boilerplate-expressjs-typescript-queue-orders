import request from 'supertest';
import app from '../src/app';

describe('GET /api/example', () => {
  it('devrait retourner un message', async () => {
    const response = await request(app).get('/api/example');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'Hello from Express TypeScript Boilerplate!');
  });
});
