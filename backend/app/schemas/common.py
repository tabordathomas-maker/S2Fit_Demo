from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class InputModel(BaseModel):
    # Rechaza campos desconocidos: un cliente no puede colar "role", "price", etc.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Message(BaseModel):
    message: str
