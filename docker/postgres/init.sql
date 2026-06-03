-- Enable pgcrypto extension for UUID generation and encryption functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable uuid-ossp for additional UUID generation methods
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
