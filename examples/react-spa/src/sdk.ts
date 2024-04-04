// Copyright © 2023 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import { Configuration, FrontendApi } from "@ory/client-fetch"
import React, { useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ResponseError } from "@ory/client-fetch/src/runtime"

export const sdk = new FrontendApi(
  new Configuration({
    //https://vitejs.dev/guide/env-and-mode.html#env-files
    basePath: import.meta.env.VITE_ORY_SDK_URL,
    // we always want to include the cookies in each request
    // cookies are used for sessions and CSRF protection
    credentials: "include",
  }),
)

async function readStream(
  stream: ReadableStream<Uint8Array> | null,
): Promise<any> {
  if (!stream) return null
  const reader = stream.getReader()
  let chunks: Uint8Array[] = []
  let done: boolean, value: Uint8Array | undefined

  while (true) {
    ;({ done, value } = await reader.read())
    if (done) break
    chunks.push(value as Uint8Array)
  }

  // Combine the chunks and decode them into a string.
  // This approach avoids string concatenation for each chunk, which can be more efficient.
  const combined = new Uint8Array(
    chunks.reduce((acc: number[], val) => [...acc, ...val], []),
  )
  return JSON.parse(new TextDecoder().decode(combined))
}

/**
 * @param getFlow - Should be function to load a flow make it visible (Login.getFlow)
 * @param setFlow - Update flow data to view (Login.setFlow)
 * @param defaultNav - Default navigate target for errors
 * @param fatalToDash - When true and error can not be handled, then redirect to dashboard, else rethrow error
 */
export const sdkError = (
  getFlow: ((flowId: string) => Promise<void | ResponseError>) | undefined,
  setFlow: React.Dispatch<React.SetStateAction<any>> | undefined,
  defaultNav: string | undefined,
  fatalToDash = false,
) => {
  const navigate = useNavigate()

  return useCallback(
    async (error: ResponseError): Promise<ResponseError | void> => {
      const responseData = (await readStream(error.response?.body)) || {}
      switch (responseData.code) {
        case 400: {
          if (responseData.error?.id === "session_already_available") {
            console.warn(
              "sdkError 400: `session_already_available`. Navigate to /",
            )
            navigate("/", { replace: true })
            return Promise.resolve()
          }
          // the request could contain invalid parameters which would set error messages in the flow
          if (setFlow !== undefined) {
            console.warn("sdkError 400: update flow data")
            setFlow(responseData)
            return Promise.resolve()
          }
          break
        }
        case 401: {
          console.warn("sdkError 401: Navigate to /login")
          navigate("/login", { replace: true })
          return Promise.resolve()
        }
        case 403: {
          // the user might have a session, but would require 2FA (Two-Factor Authentication)
          if (responseData.error?.id === "session_aal2_required") {
            navigate("/login?aal2=true", { replace: true })
            return Promise.resolve()
          }

          if (
            responseData.error?.id === "session_refresh_required" &&
            responseData.redirect_browser_to
          ) {
            console.warn("sdkError 403: Redirect browser to")
            window.location = responseData.redirect_browser_to
            return Promise.resolve()
          }
          break
        }
        case 404: {
          if (defaultNav !== undefined) {
            console.warn("sdkError 404: Navigate to Error")
            const errorMsg = {
              data: responseData.data || error,
              status: responseData.status,
              statusText: responseData.statusText,
              url: window.location.href,
            }

            navigate(
              `/error?error=${encodeURIComponent(JSON.stringify(errorMsg))}`,
              {
                replace: true,
              },
            )
            return Promise.resolve()
          }
          break
        }
        case 410: {
          if (getFlow !== undefined && responseData.use_flow_id !== undefined) {
            console.warn("sdkError 410: Update flow")
            try {
              return await getFlow(responseData.use_flow_id)
            } catch (error_1) {
              // Something went seriously wrong - log and redirect to defaultNav if possible
              console.error(error_1)

              if (defaultNav !== undefined) {
                navigate(defaultNav, { replace: true })
              } else {
                // Rethrow error when can't navigate and let caller handle
                throw error_1
              }
            }
          } else if (defaultNav !== undefined) {
            console.warn("sdkError 410: Navigate to", defaultNav)
            navigate(defaultNav, { replace: true })
            return Promise.resolve()
          }
          break
        }
        case 422: {
          if (responseData.redirect_browser_to !== undefined) {
            const currentUrl = new URL(window.location.href)
            const redirect = new URL(
              responseData.redirect_browser_to,
              // need to add the base url since the `redirect_browser_to` is a relative url with no hostname
              window.location.origin,
            )

            // Path has changed
            if (currentUrl.pathname !== redirect.pathname) {
              console.warn("sdkError 422: Update path")
              // remove /ui prefix from the path in case it is present (not setup correctly inside the project config)
              // since this is an SPA we don't need to redirect to the Account Experience.
              redirect.pathname = redirect.pathname.replace("/ui", "")
              navigate(redirect.pathname + redirect.search, {
                replace: true,
              })
              return Promise.resolve()
            }

            // for webauthn we need to reload the flow
            const flowId = redirect.searchParams.get("flow")

            if (flowId != null && getFlow !== undefined) {
              // get new flow data based on the flow id in the redirect url
              console.warn("sdkError 422: Update flow")
              try {
                return await getFlow(flowId)
              } catch (error_2) {
                // Something went seriously wrong - log and redirect to defaultNav if possible
                console.error(error_2)

                if (defaultNav !== undefined) {
                  navigate(defaultNav, { replace: true })
                } else {
                  // Rethrow error when can't navigate and let caller handle
                  throw error_2
                }
              }
            } else {
              console.warn("sdkError 422: Redirect browser to")
              window.location = responseData.redirect_browser_to
              return Promise.resolve()
            }
          }
        }
      }

      console.error(error)

      if (fatalToDash) {
        console.warn("sdkError: fatal error redirect to dashboard")
        navigate("/", { replace: true })
        return Promise.resolve()
      }

      throw error
    },
    [navigate, getFlow],
  )
}
