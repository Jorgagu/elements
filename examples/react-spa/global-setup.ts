// Copyright © 2023 Ory Corp
// SPDX-License-Identifier: Apache-2.0

const globlSetup = async () => {
  process.env.APPLICATION_URL =
    process.env.APPLICATION_URL || "http://127.0.0.1:3000"

  process.env.ORY_PROJECT_URL =
    process.env.ORY_PROJECT_URL || "http://localhost:4000"

  process.env.ORY_PROJECT_API_TOKEN = ""
}

export default globlSetup
