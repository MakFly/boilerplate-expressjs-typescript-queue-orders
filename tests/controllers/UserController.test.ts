import request from 'supertest';
import app from '../../src/app';

describe('UserController', () => {
    const testUser = {
        email: 'test@example.com',
        name: 'Test User'
    };

    describe('POST /api/users', () => {
        it('devrait créer un nouvel utilisateur', async () => {
            const response = await request(app)
                .post('/api/users')
                .send(testUser);

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.email).toBe(testUser.email);
            expect(response.body.data.name).toBe(testUser.name);
        });

        it('devrait rejeter un email invalide', async () => {
            const response = await request(app)
                .post('/api/users')
                .send({
                    ...testUser,
                    email: 'invalid-email'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.errors).toBeDefined();
        });
    });

    describe('GET /api/users', () => {
        it('devrait retourner la liste des utilisateurs', async () => {
            const response = await request(app)
                .get('/api/users');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
        });
    });

    describe('GET /api/users/:id', () => {
        it('devrait retourner un utilisateur par son ID', async () => {
            // Créer d'abord un utilisateur
            const createResponse = await request(app)
                .post('/api/users')
                .send(testUser);

            const userId = createResponse.body.data.id;

            const response = await request(app)
                .get(`/api/users/${userId}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe(userId);
        });

        it('devrait retourner 404 pour un ID inexistant', async () => {
            const response = await request(app)
                .get('/api/users/999');

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
        });
    });

    describe('PUT /api/users/:id', () => {
        it('devrait mettre à jour un utilisateur', async () => {
            // Créer d'abord un utilisateur
            const createResponse = await request(app)
                .post('/api/users')
                .send(testUser);

            const userId = createResponse.body.data.id;
            const updatedData = {
                name: 'Updated Name',
                email: 'updated@example.com'
            };

            const response = await request(app)
                .put(`/api/users/${userId}`)
                .send(updatedData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe(updatedData.name);
            expect(response.body.data.email).toBe(updatedData.email);
        });
    });

    describe('DELETE /api/users/:id', () => {
        it('devrait supprimer un utilisateur', async () => {
            // Créer d'abord un utilisateur
            const createResponse = await request(app)
                .post('/api/users')
                .send(testUser);

            const userId = createResponse.body.data.id;

            const response = await request(app)
                .delete(`/api/users/${userId}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            // Vérifier que l'utilisateur a bien été supprimé
            const getResponse = await request(app)
                .get(`/api/users/${userId}`);
            expect(getResponse.status).toBe(404);
        });
    });
}); 