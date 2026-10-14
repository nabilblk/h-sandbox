import os

from langchain.chat_models import init_chat_model

model = init_chat_model(os.environ["HARAKIRI_AGENT_MODEL"])
