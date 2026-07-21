class ProviderError(Exception):
    status_code = 502
    code = "provider_error"
    retryable = False


class ProviderUnavailable(ProviderError):
    status_code = 503
    code = "provider_unavailable"
    retryable = True


class ProviderTimeout(ProviderError):
    status_code = 504
    code = "provider_timeout"
    retryable = True


class CapabilityError(ProviderError):
    status_code = 422
    code = "capability_not_supported"


class ValidationError(ProviderError):
    status_code = 400
    code = "invalid_request"


class AuthenticationError(ProviderError):
    status_code = 401
    code = "authentication_failed"
