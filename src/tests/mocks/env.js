// Mock for $env/dynamic/private to prevent client-side import errors during testing
export const env = {
  REDIS_URL: "redis://localhost:6379",
  TYPESENSE_HOST: "localhost",
  TYPESENSE_PORT: "8108",
  TYPESENSE_PROTOCOL: "http",
  TYPESENSE_API_KEY: "test-key",
  ROMM_URL: "http://localhost:8080",
  POSTGRES_URL: "postgresql://localhost:5432/test",
};
