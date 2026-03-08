FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy config files (these rarely change)
COPY vite.config.js tailwind.config.js postcss.config.js index.html ./

# Source code is mounted as volume — not copied
# This allows hot-reload without rebuilding

EXPOSE 80

CMD ["npm", "run", "dev"]
