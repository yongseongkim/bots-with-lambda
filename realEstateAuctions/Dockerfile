FROM public.ecr.aws/lambda/nodejs:20

# Install necessary dependencies for Chromium
RUN dnf install -y \
    nss \
    freetype \
    fontconfig \
    alsa-lib \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXrandr \
    libXtst \
    xorg-x11-fonts-Type1 \
    xorg-x11-fonts-75dpi && \
    dnf clean all

# Copy function code
COPY package*.json ./

RUN npm install --production

COPY index.js ${LAMBDA_TASK_ROOT}

# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
CMD [ "index.handler" ]
