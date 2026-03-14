export interface Template {
  name: string;
  description: string;
  specUrl: string;
  baseUrl: string;
  authType: "bearer" | "apiKey" | "none";
  authHeader?: string;
  authEnvVar: string;
  docs?: string;
}

export const templates: Template[] = [
  {
    name: "petstore",
    description: "Swagger Petstore (demo API)",
    specUrl: "https://petstore3.swagger.io/api/v3/openapi.json",
    baseUrl: "https://petstore3.swagger.io/api/v3",
    authType: "none",
    authEnvVar: "",
    docs: "https://petstore3.swagger.io",
  },
  {
    name: "github",
    description: "GitHub REST API",
    specUrl: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
    baseUrl: "https://api.github.com",
    authType: "bearer",
    authEnvVar: "GITHUB_TOKEN",
    docs: "https://docs.github.com/en/rest",
  },
  {
    name: "openai",
    description: "OpenAI API",
    specUrl: "https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml",
    baseUrl: "https://api.openai.com/v1",
    authType: "bearer",
    authEnvVar: "OPENAI_API_KEY",
    docs: "https://platform.openai.com/docs/api-reference",
  },
  {
    name: "stripe",
    description: "Stripe API",
    specUrl: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
    baseUrl: "https://api.stripe.com",
    authType: "bearer",
    authEnvVar: "STRIPE_SECRET_KEY",
    docs: "https://stripe.com/docs/api",
  },
  {
    name: "cloudflare",
    description: "Cloudflare API v4",
    specUrl: "https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json",
    baseUrl: "https://api.cloudflare.com/client/v4",
    authType: "bearer",
    authEnvVar: "CLOUDFLARE_API_TOKEN",
    docs: "https://developers.cloudflare.com/api",
  },
  {
    name: "digitalocean",
    description: "DigitalOcean API v2",
    specUrl: "https://api-engineering.nyc3.cdn.digitaloceanspaces.com/spec-ci/DigitalOcean-public.v2.yaml",
    baseUrl: "https://api.digitalocean.com/v2",
    authType: "bearer",
    authEnvVar: "DIGITALOCEAN_TOKEN",
    docs: "https://docs.digitalocean.com/reference/api",
  },
];

export function getTemplate(name: string): Template | undefined {
  return templates.find((t) => t.name === name);
}
