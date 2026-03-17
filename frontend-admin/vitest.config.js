import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        css: true,
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidml0ZXN0LmNvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZpdGVzdC5jb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUM3QyxPQUFPLEtBQUssTUFBTSxzQkFBc0IsQ0FBQztBQUV6QyxlQUFlLFlBQVksQ0FBQztJQUMxQixPQUFPLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNsQixJQUFJLEVBQUU7UUFDSixPQUFPLEVBQUUsSUFBSTtRQUNiLFdBQVcsRUFBRSxPQUFPO1FBQ3BCLFVBQVUsRUFBRSxxQkFBcUI7UUFDakMsR0FBRyxFQUFFLElBQUk7S0FDVjtDQUNGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGVzdC9jb25maWcnO1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICB0ZXN0OiB7XG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBlbnZpcm9ubWVudDogJ2pzZG9tJyxcbiAgICBzZXR1cEZpbGVzOiAnLi9zcmMvdGVzdC9zZXR1cC50cycsXG4gICAgY3NzOiB0cnVlLFxuICB9LFxufSk7XG4iXX0=