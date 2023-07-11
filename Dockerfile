# Base image
FROM node:20

# Update and install Linux packages
RUN apt-get update && \
    apt-get install -y chromium && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the application code
COPY . .

# Set environment variables if needed
ENV CRON_EXPRESSION="*/1 * * * *"
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Run the cron job and start the application
CMD ["npm", "start"]
