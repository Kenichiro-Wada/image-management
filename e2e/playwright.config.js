"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
/**
 * Playwright設定
 *
 * E2Eテストの設定ファイル
 */
exports.default = (0, test_1.defineConfig)({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...test_1.devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...test_1.devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...test_1.devices['Desktop Safari'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxheXdyaWdodC5jb25maWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwbGF5d3JpZ2h0LmNvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDJDQUF5RDtBQUV6RDs7OztHQUlHO0FBQ0gsa0JBQWUsSUFBQSxtQkFBWSxFQUFDO0lBQzFCLE9BQU8sRUFBRSxTQUFTO0lBQ2xCLGFBQWEsRUFBRSxJQUFJO0lBQ25CLFVBQVUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFO0lBQzVCLE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQy9CLE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO0lBQ3ZDLFFBQVEsRUFBRSxNQUFNO0lBQ2hCLEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSx1QkFBdUI7UUFDaEMsS0FBSyxFQUFFLGdCQUFnQjtRQUN2QixVQUFVLEVBQUUsaUJBQWlCO0tBQzlCO0lBRUQsUUFBUSxFQUFFO1FBQ1I7WUFDRSxJQUFJLEVBQUUsVUFBVTtZQUNoQixHQUFHLEVBQUUsRUFBRSxHQUFHLGNBQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFO1NBQ3RDO1FBQ0Q7WUFDRSxJQUFJLEVBQUUsU0FBUztZQUNmLEdBQUcsRUFBRSxFQUFFLEdBQUcsY0FBTyxDQUFDLGlCQUFpQixDQUFDLEVBQUU7U0FDdkM7UUFDRDtZQUNFLElBQUksRUFBRSxRQUFRO1lBQ2QsR0FBRyxFQUFFLEVBQUUsR0FBRyxjQUFPLENBQUMsZ0JBQWdCLENBQUMsRUFBRTtTQUN0QztLQUNGO0lBRUQsU0FBUyxFQUFFO1FBQ1QsT0FBTyxFQUFFLGFBQWE7UUFDdEIsR0FBRyxFQUFFLHVCQUF1QjtRQUM1QixtQkFBbUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRTtLQUNyQztDQUNGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGRlZmluZUNvbmZpZywgZGV2aWNlcyB9IGZyb20gJ0BwbGF5d3JpZ2h0L3Rlc3QnO1xuXG4vKipcbiAqIFBsYXl3cmlnaHToqK3lrppcbiAqIFxuICogRTJF44OG44K544OI44Gu6Kit5a6a44OV44Kh44Kk44OrXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHRlc3REaXI6ICcuL3Rlc3RzJyxcbiAgZnVsbHlQYXJhbGxlbDogdHJ1ZSxcbiAgZm9yYmlkT25seTogISFwcm9jZXNzLmVudi5DSSxcbiAgcmV0cmllczogcHJvY2Vzcy5lbnYuQ0kgPyAyIDogMCxcbiAgd29ya2VyczogcHJvY2Vzcy5lbnYuQ0kgPyAxIDogdW5kZWZpbmVkLFxuICByZXBvcnRlcjogJ2h0bWwnLFxuICB1c2U6IHtcbiAgICBiYXNlVVJMOiAnaHR0cDovL2xvY2FsaG9zdDo1MTczJyxcbiAgICB0cmFjZTogJ29uLWZpcnN0LXJldHJ5JyxcbiAgICBzY3JlZW5zaG90OiAnb25seS1vbi1mYWlsdXJlJyxcbiAgfSxcblxuICBwcm9qZWN0czogW1xuICAgIHtcbiAgICAgIG5hbWU6ICdjaHJvbWl1bScsXG4gICAgICB1c2U6IHsgLi4uZGV2aWNlc1snRGVza3RvcCBDaHJvbWUnXSB9LFxuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogJ2ZpcmVmb3gnLFxuICAgICAgdXNlOiB7IC4uLmRldmljZXNbJ0Rlc2t0b3AgRmlyZWZveCddIH0sXG4gICAgfSxcbiAgICB7XG4gICAgICBuYW1lOiAnd2Via2l0JyxcbiAgICAgIHVzZTogeyAuLi5kZXZpY2VzWydEZXNrdG9wIFNhZmFyaSddIH0sXG4gICAgfSxcbiAgXSxcblxuICB3ZWJTZXJ2ZXI6IHtcbiAgICBjb21tYW5kOiAnbnBtIHJ1biBkZXYnLFxuICAgIHVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3MycsXG4gICAgcmV1c2VFeGlzdGluZ1NlcnZlcjogIXByb2Nlc3MuZW52LkNJLFxuICB9LFxufSk7XG4iXX0=